"""Extract dashboard columns from the SIAP worksheet for the protected CSV import.

Usage: python firebase/build_siap.py source.xlsx output.csv
The Stops worksheet is derived route data, not additional interns.

Values the dashboard groups by are tidied so one place or organization is one bar:
spelling variants that differ only in capitals ("Hong kong", "Hong Kong") take the
most common spelling, and other names for a country ("USA") take the standard name.
Extra spaces are removed by the importer itself.

A row with no destination coordinates takes its host organization's location from the
host's other rows, when those all agree on one location.
"""
import csv
from collections import Counter, defaultdict
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

from xlsx_reader import Workbook, NS

COUNTRY_NAMES = {
    "usa": "United States of America",
    "us": "United States of America",
    "u.s.a.": "United States of America",
    "united states": "United States of America",
    "america": "United States of America",
}
# Route map coordinates. A number typed with a stray trailing period or degree sign
# ("98.398392.", "114.138916°") is not readable as a number, which drops the route from
# the map; the stray characters are removed.
COORDINATE_COLUMNS = ["Origin Latitude", "Origin Longitude", "Destination Latitude", "Destination Longitude"]
TRAILING_PERIOD = re.compile(r"^(-?\d+(?:\.\d+)?)[.°]+$")
GROUPED_COLUMNS = [
    "Region",
    "Full Name of HEI",
    "Type Of HEI",
    "Full Title of the Program Enrolled In",
    "Name of Foreign Host Establishment or Organization (FHE/O)",
    "Country",
    "from City",
    "to City",
]


def _repair_coordinates(records, headers):
    """Remove a stray trailing period or degree sign from coordinates; return how many changed."""
    repaired = 0
    for name in COORDINATE_COLUMNS:
        if name not in headers:
            continue
        index = headers.index(name)
        for record in records:
            match = TRAILING_PERIOD.match(str(record[index]).strip())
            if match:
                record[index] = match.group(1)
                repaired += 1
    return repaired


def _fill_destination_from_host(records, headers):
    """Give a row with no destination coordinates its host's location from other rows.

    Used only when every other row for that host (in the same country) gives one and the
    same location, so the fill cannot pick between two branches. Returns
    {host: rows filled} and a list of hosts left unfilled because they are ambiguous.
    """
    names = ["Name of Foreign Host Establishment or Organization (FHE/O)", "Country", "to City",
             "Destination Latitude", "Destination Longitude"]
    if not all(name in headers for name in names):
        return {}, []
    host, country, city, lat, lng = (headers.index(name) for name in names)
    text = lambda value: " ".join(str(value).split())

    def coordinate(value):
        try:
            return float(text(value))
        except ValueError:
            return None

    known = defaultdict(set)
    for record in records:
        if coordinate(record[lat]) is not None and coordinate(record[lng]) is not None:
            known[(text(record[host]).lower(), text(record[country]).lower())].add(
                (text(record[lat]), text(record[lng]), text(record[city])))
    filled, ambiguous = Counter(), set()
    for record in records:
        if coordinate(record[lat]) is not None and coordinate(record[lng]) is not None:
            continue
        key = (text(record[host]).lower(), text(record[country]).lower())
        places = known.get(key, set())
        if len(places) == 1:
            record[lat], record[lng], record[city] = next(iter(places))
            filled[text(record[host])] += 1
        elif len(places) > 1:
            ambiguous.add(text(record[host]))
    return dict(filled), sorted(ambiguous)


def _tidy(records, headers):
    """Merge spellings of the same value in the grouped columns; return what changed."""
    merged = {}
    for name in GROUPED_COLUMNS:
        if name not in headers:
            continue
        index = headers.index(name)
        text = lambda value: " ".join(str(value).split())
        if name == "Country":
            for record in records:
                record[index] = COUNTRY_NAMES.get(text(record[index]).lower(), record[index])
        spellings = defaultdict(Counter)
        for record in records:
            spellings[text(record[index]).lower()][text(record[index])] += 1
        preferred = {key: counts.most_common(1)[0][0] for key, counts in spellings.items()}
        changed = 0
        for record in records:
            value = text(record[index])
            if value and preferred[value.lower()] != value:
                record[index] = preferred[value.lower()]
                changed += 1
        merged[name] = changed
    return merged


def build(source, output):
    template = Path(__file__).resolve().parents[1] / "frontend/public/siap-import-template.csv"
    with template.open(encoding="utf-8-sig", newline="") as stream:
        allowed = next(csv.reader(stream))
    normalize = lambda value: " ".join(str(value).split()).lower()
    with Workbook(source) as workbook:
        properties = ET.parse(workbook.archive.open("xl/workbook.xml")).getroot().find(f"{NS}workbookPr")
        if properties is not None and properties.get("date1904") in ("1", "true"):
            raise ValueError("1904-date-system workbooks must be converted to the 1900 date system first.")
        rows = workbook.rows("SIAP Data")
        _, headers = next(rows)
        columns = {normalize(value): index for index, value in headers.items()}
        missing = [header for header in allowed[:11] if normalize(header) not in columns]
        if missing:
            raise ValueError(f"Missing required columns: {', '.join(missing)}")
        selected = [(header, columns[normalize(header)]) for header in allowed if normalize(header) in columns]
        records = [[cells.get(index, "") for _, index in selected] for _, cells in rows if any(str(v).strip() for v in cells.values())]
    if not records:
        raise ValueError("SIAP Data has no records.")
    headers_out = [header for header, _ in selected]
    country_before = Counter(" ".join(str(r[headers_out.index("Country")]).split()) for r in records) if "Country" in headers_out else Counter()
    merged = _tidy(records, headers_out)
    repaired = _repair_coordinates(records, headers_out)
    # After tidying, so "Hong kong" and "Hong Kong" rows count as the same host and country.
    host_filled, host_ambiguous = _fill_destination_from_host(records, headers_out)
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    with Path(output).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(headers_out)
        writer.writerows(records)
    print(f"Prepared {len(records):,} SIAP records with {len(selected)} dashboard columns. Stops excluded.")
    changed = {name: count for name, count in merged.items() if count}
    if changed:
        print("Spellings merged (rows changed): " + ", ".join(f"{name} {count:,}" for name, count in changed.items()))
    if country_before:
        country_after = Counter(" ".join(str(r[headers_out.index("Country")]).split()) for r in records)
        print(f"Countries: {len(country_before)} spellings -> {len(country_after)}: " + ", ".join(sorted(country_after)))
    if repaired:
        print(f"Coordinates with a stray trailing period or degree sign repaired: {repaired:,}")
    if host_filled:
        print("Destinations filled from the same host's other rows (rows): "
              + ", ".join(f"{host} ({count:,})" for host, count in host_filled.items()))
    if host_ambiguous:
        print("Not filled, the host has more than one location: " + ", ".join(host_ambiguous))
    if all(name in headers_out for name in COORDINATE_COLUMNS):
        columns = [headers_out.index(name) for name in COORDINATE_COLUMNS]
        def readable(value):
            try:
                float(str(value).strip())
                return True
            except ValueError:
                return False
        mapped = sum(1 for r in records if all(readable(r[i]) for i in columns))
        print(f"Rows the route map can draw (all four coordinates present): {mapped:,} of {len(records):,}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python firebase/build_siap.py source.xlsx output.csv")
    build(sys.argv[1], sys.argv[2])
