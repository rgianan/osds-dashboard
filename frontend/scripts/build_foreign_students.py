"""Build the Foreign Students dashboard data from the CHED foreign-students workbook.

Usage (from the frontend directory):
    python scripts/build_foreign_students.py path/to/data_fs.xlsx

The workbook contains personal data (dates of birth, addresses, passport and
ACR numbers). This script reads only academic year, region, sex, nationality,
and the HEI's city/province, and writes counts per combination of those fields
to src/data/foreign-students.json. No row-level record leaves this script.

HEI cities are geocoded once through OpenStreetMap Nominatim (city and province
names only) and cached in scripts/ph-city-coordinates.json, so later builds run
offline. Review any entry marked "needsReview" in that file.
"""
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "src" / "data" / "foreign-students.json"
DEFAULT_COORDS = ROOT / "scripts" / "ph-city-coordinates.json"

# (header text before the first line break, occurrence) in the "data" sheet.
# The HEI province/city columns are VLOOKUP results that all share one header,
# so they are selected by occurrence and verified against Sheet2 below.
COLUMNS = {
    "academic_year": ("Academic Year", 0),
    "region": ("Region", 0),
    "sex": ("Sex", 0),
    "nationality": ("Nationality", 0),
    "hei_province": ("Not Found / Does Not Match the UII", 4),
    "hei_city": ("Not Found / Does Not Match the UII", 5),
}
DATA_SHEET = "data"
HEI_SHEET = "Sheet2"
HEI_SHEET_CITY_HEADER = "City/Municipality"

SEX_LABELS = {"m": "Male", "male": "Male", "f": "Female", "female": "Female"}
NOT_SPECIFIED = "Not specified"
NATIONALITY_SYNONYMS = {
    "n/a": NOT_SPECIFIED,
    "na": NOT_SPECIFIED,
    "not captured": NOT_SPECIFIED,
    "other + state nationality": "Other",
    "nepalese": "Nepali",
    "rwandese": "Rwandan",
    "botswana": "Batswana",
    "mocambican": "Mozambican",
    "madagascar": "Malagasy",
    "osterreich": "Austrian",
    "argentiniean": "Argentine",
    "peruana": "Peruvian",
    "ireland": "Irish",
    "slovakia": "Slovak",
    "tajikistan": "Tajik",
    "umurundi": "Burundian",
    "upper voltan": "Burkinabe",
    "mecanese": "Macanese",
    "saint kitts and nevis": "Kittitian or Nevisian",
}

MANILA_DISTRICTS = {
    "binondo", "ermita", "intramuros", "malate", "paco", "pandacan", "port area", "quiapo",
    "sampaloc", "san miguel", "san nicolas", "santa ana", "santa cruz", "santa mesa", "tondo",
}
PH_BOUNDS = {"lat": (4.0, 21.5), "lng": (116.0, 127.5)}
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "siap-dashboard-foreign-students-build/1.0 (+https://osds-dashboard.netlify.app)"
OUTLIER_KM = 90

XLSX_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


# --- Workbook reading (streamed; the file is large) ---------------------------------

def _column_index(ref):
    index = 0
    for char in re.match(r"[A-Z]+", ref).group(0):
        index = index * 26 + ord(char) - 64
    return index - 1


def _shared_strings(archive):
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    strings = []
    for _, element in ET.iterparse(archive.open("xl/sharedStrings.xml")):
        if element.tag == f"{XLSX_NS}si":
            strings.append("".join(text.text or "" for text in element.iter(f"{XLSX_NS}t")))
            element.clear()
    return strings


def _sheet_paths(archive):
    workbook = ET.parse(archive.open("xl/workbook.xml")).getroot()
    rels = ET.parse(archive.open("xl/_rels/workbook.xml.rels")).getroot()
    targets = {rel.get("Id"): rel.get("Target").lstrip("/") for rel in rels}
    paths = {}
    for sheet in workbook.find(f"{XLSX_NS}sheets"):
        target = targets[sheet.get(REL_ID)]
        paths[sheet.get("name")] = target if target.startswith("xl/") else f"xl/{target}"
    return paths


def _rows(archive, path, strings):
    for _, element in ET.iterparse(archive.open(path)):
        if element.tag != f"{XLSX_NS}row":
            continue
        row = {}
        for cell in element.findall(f"{XLSX_NS}c"):
            value = cell.find(f"{XLSX_NS}v")
            if cell.get("t") == "inlineStr":
                text = "".join(t.text or "" for t in cell.iter(f"{XLSX_NS}t"))
            elif value is None:
                continue
            elif cell.get("t") == "s":
                text = strings[int(value.text)]
            else:
                text = value.text
            row[_column_index(cell.get("r"))] = text
        element.clear()
        yield row


def _header_key(text):
    return str(text or "").split("\n")[0].strip().lower()


def _resolve_columns(header_row):
    positions = defaultdict(list)
    for index in sorted(header_row):
        positions[_header_key(header_row[index])].append(index)
    resolved = {}
    for field, (header, occurrence) in COLUMNS.items():
        matches = positions.get(header.lower(), [])
        if len(matches) <= occurrence:
            sys.exit(f"Column '{header}' (occurrence {occurrence + 1}) not found in sheet '{DATA_SHEET}'.")
        resolved[field] = matches[occurrence]
    return resolved


def _clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


# --- Normalization ------------------------------------------------------------------

def _sex(value):
    return SEX_LABELS.get(_clean(value).lower(), NOT_SPECIFIED)


def _nationality_resolver(raw_counts):
    """Map each raw value to one canonical label: synonyms first, then the most common casing."""
    casing = defaultdict(Counter)
    for raw, count in raw_counts.items():
        casing[raw.lower()][raw] += count

    def resolve(raw):
        key = raw.lower()
        if not key:
            return NOT_SPECIFIED
        if key in NATIONALITY_SYNONYMS:
            return NATIONALITY_SYNONYMS[key]
        best = casing[key].most_common(1)[0][0]
        return best if best != best.upper() else best.title()

    return resolve


def _region_sort_key(region):
    match = re.match(r"(\d+)", region)
    return (int(match.group(1)) if match else 999, region)


def _last(values, *tail):
    head = sorted(v for v in values if v not in tail)
    return head + [v for v in tail if v in values]


# --- Geocoding ----------------------------------------------------------------------

def _query_name(city, province):
    name = re.sub(r"^Sta\.\s*", "Santa ", city)
    name = re.sub(r"^Sto\.\s*", "Santo ", name)
    name = re.sub(r"^Science City of\s+", "", name)
    province_name = {"Quezon Province": "Quezon", "North Cotabato": "Cotabato"}.get(province, province)
    if province == "Metro Manila" and name.lower() in MANILA_DISTRICTS:
        return f"{name}, Manila, Philippines", "manila"
    return f"{name}, {province_name}, Philippines", province_name.lower()


def _geocode(city, province):
    query, expected = _query_name(city, province)
    params = urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 5, "countrycodes": "ph", "addressdetails": 1})
    request = urllib.request.Request(f"{NOMINATIM_URL}?{params}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        results = json.load(response)
    if not results:
        return {"lat": None, "lng": None, "query": query, "needsReview": True, "note": "No result"}
    matched = next((r for r in results if expected in r.get("display_name", "").lower()), None)
    chosen = matched or results[0]
    return {
        "lat": round(float(chosen["lat"]), 5),
        "lng": round(float(chosen["lon"]), 5),
        "query": query,
        "displayName": chosen.get("display_name", ""),
        "needsReview": matched is None,
        "note": "" if matched else f"Top result does not mention '{expected}'",
    }


def _distance_km(a, b):
    from math import asin, cos, radians, sin, sqrt
    lat1, lng1, lat2, lng2 = map(radians, (a[0], a[1], b[0], b[1]))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
    return 6371 * 2 * asin(sqrt(h))


def _flag_outliers(coords, cities):
    """Flag a city that sits far from the other cities of its province."""
    by_province = defaultdict(list)
    for city, province in cities:
        entry = coords.get(f"{city}|{province}")
        if entry and entry.get("lat") is not None:
            by_province[province].append((city, entry))
    for province, entries in by_province.items():
        if len(entries) < 3:
            continue
        center = (median(e["lat"] for _, e in entries), median(e["lng"] for _, e in entries))
        for city, entry in entries:
            km = _distance_km(center, (entry["lat"], entry["lng"]))
            if km > OUTLIER_KM:
                entry["needsReview"] = True
                entry["note"] = f"{round(km)} km from other {province} cities"


def _load_coordinates(path, cities, allow_network):
    coords = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    missing = [(c, p) for c, p in cities if f"{c}|{p}" not in coords]
    if missing and not allow_network:
        print(f"{len(missing)} cities have no coordinates; rerun without --offline to geocode them.")
    for index, (city, province) in enumerate(missing if allow_network else []):
        print(f"  geocoding {index + 1}/{len(missing)}: {city}, {province}")
        try:
            coords[f"{city}|{province}"] = _geocode(city, province)
        except Exception as error:  # keep going; the city is reported as unmapped
            coords[f"{city}|{province}"] = {"lat": None, "lng": None, "needsReview": True, "note": f"Lookup failed: {error}"}
        time.sleep(1.1)  # Nominatim usage policy: at most one request per second
    for key, entry in coords.items():
        lat, lng = entry.get("lat"), entry.get("lng")
        if lat is not None and not (PH_BOUNDS["lat"][0] <= lat <= PH_BOUNDS["lat"][1] and PH_BOUNDS["lng"][0] <= lng <= PH_BOUNDS["lng"][1]):
            entry["needsReview"] = True
            entry["note"] = "Outside the Philippines"
    _flag_outliers(coords, cities)
    path.write_text(json.dumps(dict(sorted(coords.items())), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return coords


# --- Build --------------------------------------------------------------------------

def build(xlsx_path, out_path, coords_path, allow_network):
    with zipfile.ZipFile(xlsx_path) as archive:
        strings = _shared_strings(archive)
        sheets = _sheet_paths(archive)
        if DATA_SHEET not in sheets:
            sys.exit(f"Sheet '{DATA_SHEET}' not found. Sheets: {', '.join(sheets)}")

        hei_cities = set()
        if HEI_SHEET in sheets:
            hei_rows = _rows(archive, sheets[HEI_SHEET], strings)
            header = next(hei_rows, {})
            city_index = next((i for i, h in header.items() if _clean(h) == HEI_SHEET_CITY_HEADER), None)
            if city_index is not None:
                hei_cities = {_clean(r.get(city_index)).lower() for r in hei_rows if r.get(city_index)}

        data_rows = _rows(archive, sheets[DATA_SHEET], strings)
        columns = _resolve_columns(next(data_rows))
        records = []
        raw_nationalities = Counter()
        for row in data_rows:
            if not row:
                continue
            record = {field: _clean(row.get(index)) for field, index in columns.items()}
            if not any(record.values()):
                continue
            raw_nationalities[record["nationality"]] += 1
            records.append(record)

    if hei_cities:
        known = sum(1 for r in records if r["hei_city"].lower() in hei_cities)
        if known / len(records) < 0.9:
            sys.exit(f"Only {known / len(records):.0%} of HEI city values appear in {HEI_SHEET}; check COLUMNS['hei_city'].")

    nationality = _nationality_resolver(raw_nationalities)
    counts = Counter()
    for r in records:
        counts[(r["academic_year"], r["region"], _sex(r["sex"]), nationality(r["nationality"]), (r["hei_city"], r["hei_province"]))] += 1

    years = sorted({k[0] for k in counts})
    regions = sorted({k[1] for k in counts}, key=_region_sort_key)
    sexes = _last({k[2] for k in counts}, NOT_SPECIFIED)
    nationalities = _last({k[3] for k in counts}, "Other", NOT_SPECIFIED)
    cities = sorted({k[4] for k in counts})
    coords = _load_coordinates(coords_path, cities, allow_network)

    index = {name: {value: i for i, value in enumerate(values)} for name, values in
             (("y", years), ("r", regions), ("s", sexes), ("n", nationalities), ("c", cities))}
    output = {
        "meta": {
            "sourceFile": Path(xlsx_path).name,
            "sourceModified": datetime.fromtimestamp(Path(xlsx_path).stat().st_mtime, timezone.utc).date().isoformat(),
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "totalRecords": len(records),
            "cityBasis": "HEI city",
            "cellFields": ["academicYear", "region", "sex", "nationality", "city", "count"],
        },
        "dimensions": {
            "academicYear": years,
            "region": regions,
            "sex": sexes,
            "nationality": nationalities,
            "city": [
                {"name": c, "province": p, "lat": coords.get(f"{c}|{p}", {}).get("lat"), "lng": coords.get(f"{c}|{p}", {}).get("lng")}
                for c, p in cities
            ],
        },
        "cells": [
            [index["y"][y], index["r"][r], index["s"][s], index["n"][n], index["c"][c], count]
            for (y, r, s, n, c), count in sorted(counts.items(), key=lambda kv: -kv[1])
        ],
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    review = {k: v for k, v in coords.items() if v.get("needsReview") and tuple(k.split("|")) in set(cities)}
    unmapped = sum(count for (_, _, _, _, c), count in counts.items() if coords.get(f"{c[0]}|{c[1]}", {}).get("lat") is None)
    print(f"Wrote {out_path.relative_to(ROOT)}: {len(records):,} records -> {len(counts):,} count cells, {out_path.stat().st_size / 1024:.0f} KB")
    print(f"Dimensions: {len(years)} years, {len(regions)} regions, {len(sexes)} sexes, {len(nationalities)} nationalities, {len(cities)} cities")
    print(f"Records at cities without coordinates: {unmapped:,}")
    merged = sorted({raw for raw in raw_nationalities if nationality(raw) != raw})
    print(f"Nationality spellings merged: {len(merged)} ({len(raw_nationalities)} raw -> {len(nationalities)} labels)")
    if review:
        print(f"\nCoordinates to review in {coords_path.relative_to(ROOT)}:")
        for key, entry in review.items():
            print(f"  {key}: {entry.get('note')} -> {entry.get('displayName', '')[:90]}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("xlsx", help="Path to the foreign students workbook (.xlsx)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--coords", type=Path, default=DEFAULT_COORDS)
    parser.add_argument("--offline", action="store_true", help="Do not geocode new cities")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    build(args.xlsx, args.out, args.coords, not args.offline)


if __name__ == "__main__":
    main()
