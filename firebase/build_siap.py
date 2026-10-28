"""Extract dashboard columns from the SIAP worksheet for the protected CSV import.

Usage: python firebase/build_siap.py source.xlsx output.csv
The Stops worksheet is derived route data, not additional interns.

Values the dashboard groups by are tidied so one place or organization is one bar:
spelling variants that differ only in capitals ("Hong kong", "Hong Kong") take the
most common spelling, and other names for a country ("USA") take the standard name.
Extra spaces are removed by the importer itself.
"""
import csv
from collections import Counter, defaultdict
from pathlib import Path
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


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python firebase/build_siap.py source.xlsx output.csv")
    build(sys.argv[1], sys.argv[2])
