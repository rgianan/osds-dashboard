"""Build the Foreign Students summary from the CHED foreign-students workbook.

Usage (from firebase/functions):
    npm run build:foreign-students -- "path/to/foreign-students.xlsx"
    npm run publish:foreign-students

The workbook can contain personal data (dates of birth, addresses). This script
reads only academic year, region, sex, nationality, HEI type, the HEI's city and
province, and the HEI's institution code, and writes counts per combination of
those fields to foreign-students.json next to this script. No row-level record
is written. Each HEI is written as its institution code and its name from the
HEI list (Sheet2), for the HEI filter and the distinct-HEI count.

Where the data sheet's own lookup failed (its HEI type, city, and province columns
read "Not Found / Does Not Match the UII"), those values are taken from Sheet2 by the
row's HEI code (the "Ins Code True" column). Rows whose code is not in Sheet2 stay
"Not specified"; the script lists those codes.

HEI cities are geocoded once through OpenStreetMap Nominatim (city and province
names only) and cached in ph-city-coordinates.json, so later builds run offline.
Review any entry the script reports before publishing.
"""
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from xlsx_reader import Workbook  # noqa: E402  (shared with firebase/reports)

DEFAULT_OUT = HERE / "foreign-students.json"
DEFAULT_COORDS = HERE / "ph-city-coordinates.json"

# (header text before the first line break, occurrence) in the data sheet.
COLUMNS = {
    "academic_year": ("Academic Year", 0),
    "region": ("Region", 0),
    "sex": ("Sex", 0),
    "nationality": ("Nationality", 0),
    "hei_type": ("HEI Type", 0),
}
# The HEI code, city, and province columns are lookups from the HEI list, and
# their headers have been mislabeled in past versions of the workbook, so they
# are found by content: the column whose values best match the HEI list's
# UII (or City/Municipality, or Province) column.
MIN_HEI_MATCH = 0.9
DATA_SHEET = "data"
HEI_SHEET = "Sheet2"
HEI_SHEET_HEADERS = {"hei": "UII", "city": "City/Municipality", "province": "Province"}
# Columns of the HEI list kept per institution, for its name and for filling in
# lookups the data sheet could not resolve.
HEI_SHEET_RECORD = {"name": "HEI Name", "type": "HEI Type", "city": "City/Municipality", "province": "Province"}
HEI_CODE_DIGITS = 5
# The data sheet's lookup columns hold this text (or #N/A, or nothing) when its own
# lookup failed; those rows are filled from the HEI list by the row's HEI code.
NOT_FOUND_PREFIX = "not found"

SEX_LABELS = {"m": "Male", "male": "Male", "f": "Female", "female": "Female"}
NOT_SPECIFIED = "Not specified"
# A region written with two numbers across years ("16 - CARAGA" in 2022-23, "19 - CARAGA"
# in 2025-26) would show as two regions.
REGION_SYNONYMS = {
    "19 - CARAGA": "16 - CARAGA",
}
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
    # Spellings first seen in 2025-2026, merged into the existing labels.
    "east timorese": "Timorese",
    "myanmar (burmese)": "Burmese",
    "south korean": "Korean",
    "laotian": "Lao",
    "botswanan": "Batswana",
    "burkinabé": "Burkinabe",
    "eswatini": "Swazi",
    "lesotho": "Basotho",
    "equatorial guinean": "Equatoguinean",
    "singapore citizen": "Singaporean",
    "somalian": "Somali",
    "british citizen": "British",
    "beninese": "Beninoise",
    "vanuatuan": "Vanuatu",
}

MANILA_DISTRICTS = {
    "binondo", "ermita", "intramuros", "malate", "paco", "pandacan", "port area", "quiapo",
    "sampaloc", "san miguel", "san nicolas", "santa ana", "santa cruz", "santa mesa", "tondo",
}
PH_BOUNDS = {"lat": (4.0, 21.5), "lng": (116.0, 127.5)}
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "siap-dashboard-foreign-students-build/1.0 (+https://osds-dashboard.netlify.app)"
OUTLIER_KM = 90


# --- Workbook reading -----------------------------------------------------------------

def _header_key(text):
    return str(text or "").split("\n")[0].strip().lower()


def _clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


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


def _hei_reference(workbook):
    if HEI_SHEET not in workbook.sheet_names:
        sys.exit(f"Sheet '{HEI_SHEET}' (the HEI list) is required to identify the HEI city and province columns.")
    rows = (cells for _, cells in workbook.rows(HEI_SHEET))
    header = next(rows, {})
    columns = {**HEI_SHEET_HEADERS, **{f"record_{key}": name for key, name in HEI_SHEET_RECORD.items()}}
    indexes = {key: next((i for i, h in header.items() if _clean(h) == name), None) for key, name in columns.items()}
    missing = sorted({columns[key] for key, index in indexes.items() if index is None})
    if missing:
        sys.exit(f"Sheet '{HEI_SHEET}' is missing column(s): {', '.join(missing)}")
    values = {key: set() for key in HEI_SHEET_HEADERS}
    heis = {}
    for row in rows:
        for key in HEI_SHEET_HEADERS:
            if row.get(indexes[key]):
                values[key].add(_clean(row[indexes[key]]).lower())
        if row.get(indexes["hei"]):
            heis.setdefault(_hei_code(row[indexes["hei"]]), {key: _clean(row.get(indexes[f"record_{key}"])) for key in HEI_SHEET_RECORD})
    return values, heis


def _best_match_column(rows, header_row, reference, label):
    rates = []
    for index in sorted(header_row):
        matched = sum(1 for row in rows if _clean(row.get(index)).lower() in reference)
        rates.append((matched / len(rows), index))
    rates.sort(reverse=True)
    rate, index = rates[0]
    name = _clean(header_row[index])
    if rate < MIN_HEI_MATCH:
        candidates = ", ".join(f"'{_clean(header_row[i])}' {r:.0%}" for r, i in rates[:3])
        sys.exit(f"No column matches the HEI list's {label} values closely enough (best: {candidates}).")
    print(f"HEI {label}: column '{name}' ({rate:.1%} of rows match {HEI_SHEET})")
    return index


# --- Normalization ------------------------------------------------------------------

def _sex(value):
    return SEX_LABELS.get(_clean(value).lower(), NOT_SPECIFIED)


def _hei_code(value):
    # Some rows store a numeric code without its leading zero (7045 for 07045).
    code = _clean(value)
    return code.zfill(HEI_CODE_DIGITS) if code.isdigit() else code or NOT_SPECIFIED


def _not_found(value):
    text = _clean(value).lower()
    return not text or text.startswith(NOT_FOUND_PREFIX) or text in ("#n/a", "n/a")


def _fill_from_hei_list(records, heis):
    """Fill HEI type, city, and province the data sheet could not look up.

    The HEI list stores the type as a code ("1", "2a"); the data sheet's own label for
    each code is learned from rows where both are present, so filled rows use the same
    labels as the rest. Returns counts of filled and unresolved values per field.
    """
    labels = defaultdict(Counter)
    for record in records:
        hei = heis.get(_hei_code(record["hei_code"]))
        if hei and hei["type"] and not _not_found(record["hei_type"]):
            labels[hei["type"]][record["hei_type"]] += 1
    type_label = {code: counts.most_common(1)[0][0] for code, counts in labels.items()}

    report = Counter()
    unresolved_codes = Counter()
    for record in records:
        code = _hei_code(record["hei_code"])
        hei = heis.get(code) or {}
        looked_up = False
        for field, key in (("hei_type", "type"), ("hei_city", "city"), ("hei_province", "province")):
            if not _not_found(record[field]):
                continue
            looked_up = True
            value = type_label.get(hei.get(key), "") if key == "type" else hei.get(key, "")
            record[field] = value
            report[f"{key} filled" if value else f"{key} unresolved"] += 1
        if looked_up and not hei:
            unresolved_codes[code] += 1
    return report, type_label, unresolved_codes


def _nationality_resolver(raw_counts):
    """Map each raw value to one label: synonyms first, then the most common casing."""
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
    lat1, lng1, lat2, lng2 = map(radians, (a[0], a[1], b[0], b[1]))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
    return 6371 * 2 * asin(sqrt(h))


def _flag_outliers(coords, cities):
    """Flag a city that sits far from the other cities of its province."""
    by_province = defaultdict(list)
    for city, province in cities:
        entry = coords.get(f"{city}|{province}")
        if entry and entry.get("lat") is not None and entry.get("source") != "manual":
            by_province[province].append(entry)
    for province, entries in by_province.items():
        if len(entries) < 3:
            continue
        center = (median(e["lat"] for e in entries), median(e["lng"] for e in entries))
        for entry in entries:
            km = _distance_km(center, (entry["lat"], entry["lng"]))
            if km > OUTLIER_KM:
                entry["needsReview"] = True
                entry["note"] = f"{round(km)} km from other {province} cities"


def _load_coordinates(path, cities, allow_network):
    coords = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    # A city nobody could look up has no place to geocode; it is reported as unmapped.
    missing = [(c, p) for c, p in cities if f"{c}|{p}" not in coords and c != NOT_SPECIFIED]
    if missing and not allow_network:
        print(f"{len(missing)} cities have no coordinates; rerun without --offline to geocode them.")
    for index, (city, province) in enumerate(missing if allow_network else []):
        print(f"  geocoding {index + 1}/{len(missing)}: {city}, {province}")
        try:
            coords[f"{city}|{province}"] = _geocode(city, province)
        except Exception as error:  # keep going; the city is reported as unmapped
            coords[f"{city}|{province}"] = {"lat": None, "lng": None, "needsReview": True, "note": f"Lookup failed: {error}"}
        time.sleep(1.1)  # Nominatim usage policy: at most one request per second
    for entry in coords.values():
        lat, lng = entry.get("lat"), entry.get("lng")
        if lat is not None and not (PH_BOUNDS["lat"][0] <= lat <= PH_BOUNDS["lat"][1] and PH_BOUNDS["lng"][0] <= lng <= PH_BOUNDS["lng"][1]):
            entry["needsReview"] = True
            entry["note"] = "Outside the Philippines"
    _flag_outliers(coords, cities)
    path.write_text(json.dumps(dict(sorted(coords.items())), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return coords


# --- Build --------------------------------------------------------------------------

def build(xlsx_path, out_path, coords_path, allow_network):
    with Workbook(xlsx_path) as workbook:
        if DATA_SHEET not in workbook.sheet_names:
            sys.exit(f"Sheet '{DATA_SHEET}' not found. Sheets: {', '.join(workbook.sheet_names)}")
        reference, hei_list = _hei_reference(workbook)
        data_rows = (cells for _, cells in workbook.rows(DATA_SHEET))
        header_row = next(data_rows)
        rows = [row for row in data_rows if row]

    columns = _resolve_columns(header_row)
    # Columns O and P have had their City/Province labels swapped in source
    # versions, so identify each by matching its contents to the HEI registry.
    columns["hei_code"] = _best_match_column(rows, header_row, reference["hei"], "code")
    columns["hei_city"] = _best_match_column(rows, header_row, reference["city"], "city")
    columns["hei_province"] = _best_match_column(rows, header_row, reference["province"], "province")
    records = [{field: _clean(row.get(index)) for field, index in columns.items()} for row in rows]
    records = [record for record in records if any(record.values())]
    filled, type_label, unresolved_codes = _fill_from_hei_list(records, hei_list)
    raw_nationalities = Counter(record["nationality"] for record in records)
    nationality = _nationality_resolver(raw_nationalities)
    counts = Counter(
        (r["academic_year"], REGION_SYNONYMS.get(r["region"], r["region"]), _sex(r["sex"]), nationality(r["nationality"]),
         r["hei_type"] or NOT_SPECIFIED, r["hei_city"] or NOT_SPECIFIED, r["hei_province"] or NOT_SPECIFIED, _hei_code(r["hei_code"]))
        for r in records
    )

    years = sorted({k[0] for k in counts})
    regions = sorted({k[1] for k in counts}, key=_region_sort_key)
    sexes = _last({k[2] for k in counts}, NOT_SPECIFIED)
    nationalities = _last({k[3] for k in counts}, "Other", NOT_SPECIFIED)
    hei_types = _last({k[4] for k in counts}, NOT_SPECIFIED)
    provinces = _last({k[6] for k in counts}, NOT_SPECIFIED)
    cities = sorted({(k[5], k[6]) for k in counts})
    heis = _last({k[7] for k in counts}, NOT_SPECIFIED)
    coords = _load_coordinates(coords_path, cities, allow_network)

    index = {name: {value: i for i, value in enumerate(values)} for name, values in
             (("y", years), ("r", regions), ("s", sexes), ("n", nationalities), ("h", hei_types),
              ("c", cities), ("p", provinces), ("i", heis))}
    output = {
        "meta": {
            "sourceFile": Path(xlsx_path).name,
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "totalRecords": len(records),
            "cityBasis": "HEI city",
            "cellFields": ["academicYear", "region", "sex", "nationality", "heiType", "city", "province", "hei", "count"],
        },
        "dimensions": {
            "academicYear": years,
            "region": regions,
            "sex": sexes,
            "nationality": nationalities,
            "heiType": hei_types,
            "province": provinces,
            "city": [
                {"name": c, "province": p, "lat": coords.get(f"{c}|{p}", {}).get("lat"), "lng": coords.get(f"{c}|{p}", {}).get("lng")}
                for c, p in cities
            ],
            # A code missing from the HEI list keeps the code as its name (reported below).
            "hei": [{"code": code, "name": (hei_list.get(code) or {}).get("name") or code} for code in heis],
        },
        "cells": [
            [index["y"][y], index["r"][r], index["s"][s], index["n"][n], index["h"][h], index["c"][(c, p)], index["p"][p], index["i"][i], count]
            for (y, r, s, n, h, c, p, i), count in sorted(counts.items(), key=lambda kv: -kv[1])
        ],
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    city_set = set(cities)
    review = {k: v for k, v in coords.items() if v.get("needsReview") and tuple(k.split("|")) in city_set}
    unmapped = sum(count for (_, _, _, _, _, c, p, _), count in counts.items() if coords.get(f"{c}|{p}", {}).get("lat") is None)
    merged = sum(1 for raw in raw_nationalities if nationality(raw) != raw)
    print(f"Wrote {out_path.name}: {len(records):,} records -> {len(counts):,} count cells, {out_path.stat().st_size / 1024:.0f} KB")
    print(f"Dimensions: {len(years)} years, {len(regions)} regions, {len(sexes)} sexes, {len(nationalities)} nationalities, "
          f"{len(hei_types)} HEI types, {len(cities)} city/province locations, {len(provinces)} provinces, {len(heis)} HEIs")
    print(f"Records at cities without coordinates: {unmapped:,}")
    if filled:
        print(f"Lookups the data sheet could not resolve, filled from {HEI_SHEET} by HEI code: "
              + ", ".join(f"{key} {count:,}" for key, count in sorted(filled.items())))
        print(f"  {HEI_SHEET} HEI type codes read as: {dict(sorted(type_label.items()))}")
    if unresolved_codes:
        print(f"  HEI codes not in {HEI_SHEET}, left as Not specified (rows): "
              + ", ".join(f"{code} ({count:,})" for code, count in unresolved_codes.most_common()))
    unnamed = [code for code in heis if code != NOT_SPECIFIED and not (hei_list.get(code) or {}).get("name")]
    if unnamed:
        print(f"HEI codes without a name in {HEI_SHEET}, shown by code: {', '.join(unnamed)}")
    print(f"Nationality spellings merged: {merged} ({len(raw_nationalities)} raw -> {len(nationalities)} labels)")
    if review:
        print(f"\nCoordinates to review in {coords_path.name}:")
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
