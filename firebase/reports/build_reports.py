"""Build a published report (summary tables) from a CHED report workbook.

Usage (from firebase/functions):
    npm run build:report -- tosf-increase "path/to/tuition and other school fee increase.xlsx"
    npm run build:report -- anti-hazing "path/to/Report on the Implementation of Anti-Hazing Law (RA 11053).xlsx"
    npm run publish:report -- tosf-increase

Each report is described in REPORTS below. A table is found by its header row
(the row label column plus every value column must match), so sheet names and
column order do not matter. A "GRAND TOTAL" row is checked against the sum of
the rows. Output is written to <report-id>.json next to this script.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from xlsx_reader import Workbook  # noqa: E402

REPORTS = {
    "tosf-increase": {
        "title": "Tuition and Other School Fees (TOSF) Increase",
        "tables": [
            {
                "key": "applications",
                "rowLabel": r"^region$",
                "columns": {
                    "approvedWithinRir": r"approved.*(below|within).*(rir|inflation)",
                    "applicationsReceived": r"applications received",
                },
                # (left, right): warn when left > right in a row
                "checks": [("approvedWithinRir", "applicationsReceived")],
            },
            {
                "key": "appealResults",
                "rowLabel": r"^region$",
                "columns": {
                    "lowered": r"lowered",
                    "deferred": r"deferred",
                    "withdrawn": r"withdrawn",
                },
            },
        ],
    },
    "anti-hazing": {
        "title": "Implementation of the Anti-Hazing Law (RA 11053)",
        "tables": [
            {
                "key": "indicators",
                "rowLabel": r"^indicator$",
                "columns": {"positiveResponses": r"positive response"},
            },
        ],
    },
}

TOTAL_ROW = re.compile(r"^(grand\s+)?total$", re.I)
NUMBER_WITH_NOTE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*(?:[-–:(]\s*(.*?)\)?)?\s*$")
ACADEMIC_YEAR = re.compile(r"\bAY\s*(\d{4})\s*[-–]\s*(\d{4})", re.I)


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_number(text):
    """'30' -> (30, None); '1- pending confirmation of CHEDRO' -> (1, 'pending confirmation of CHEDRO')."""
    match = NUMBER_WITH_NOTE.match(clean(text))
    if not match:
        return None, clean(text)
    number = float(match.group(1))
    return (int(number) if number.is_integer() else number), (match.group(2) or None)


def find_table(workbook, spec):
    found = []
    for sheet in workbook.sheet_names:
        rows = [(number, {col: clean(text) for col, text in cells.items() if clean(text)}) for number, cells in workbook.rows(sheet)]
        for position, (_, cells) in enumerate(rows):
            label_col = next((col for col, text in cells.items() if re.search(spec["rowLabel"], text, re.I)), None)
            if label_col is None:
                continue
            columns = {}
            for key, pattern in spec["columns"].items():
                col = next((c for c, text in cells.items() if c != label_col and re.search(pattern, text, re.I)), None)
                if col is None:
                    break
                columns[key] = (col, cells[col])
            if len(columns) == len(spec["columns"]):
                title = " ".join(" ".join(c.values()) for _, c in rows[:position] if c)
                found.append((sheet, title, cells[label_col], label_col, columns, rows[position + 1:]))
    if len(found) != 1:
        where = ", ".join(f"'{sheet}'" for sheet, *_ in found) or "no sheet"
        sys.exit(f"Table '{spec['key']}' must match exactly one header row; found in {where}.")
    return found[0]


def build_table(workbook, spec, warnings):
    sheet, title, label_header, label_col, columns, data_rows = find_table(workbook, spec)
    rows, total_row = [], None
    for number, cells in data_rows:
        label = cells.get(label_col)
        if not label:
            if rows:
                break  # the table ends at the first row without a label
            continue
        values, notes = {}, {}
        for key, (col, header) in columns.items():
            value, note = parse_number(cells.get(col, ""))
            if value is None:
                sys.exit(f"{sheet} row {number}: '{header}' is not a number: {note!r}")
            values[key] = value
            if note:
                notes[key] = note
        if TOTAL_ROW.match(label):
            total_row = (number, values)
            break
        row = {"label": label, "values": values}
        numbered = re.match(r"^(\d+)\.\s+(.+)$", label)
        if numbered:
            row = {"number": int(numbered.group(1)), "label": numbered.group(2), "values": values}
        if notes:
            row["notes"] = notes
        rows.append(row)
        for left, right in spec.get("checks", []):
            if values[left] > values[right]:
                warnings.append(f"{spec['key']}: {label} has {left} = {values[left]} greater than {right} = {values[right]}")

    totals = {key: sum(row["values"][key] for row in rows) for key in columns}
    if total_row:
        number, stated = total_row
        for key, value in stated.items():
            if value != totals[key]:
                warnings.append(f"{spec['key']}: stated total for {key} is {value} (sheet row {number}), but the rows add up to {totals[key]}")
    return {
        "key": spec["key"],
        "title": title,
        "sheet": sheet,
        "rowLabel": label_header,
        "columns": [{"key": key, "label": header} for key, (_, header) in columns.items()],
        "rows": rows,
        "totals": totals,
    }


def build(report_id, xlsx_path, out_dir):
    spec = REPORTS[report_id]
    warnings = []
    with Workbook(xlsx_path) as workbook:
        tables = [build_table(workbook, table, warnings) for table in spec["tables"]]
    years = sorted({"-".join(m) for table in tables for m in ACADEMIC_YEAR.findall(table["title"])})
    report = {
        "id": report_id,
        "title": spec["title"],
        "academicYear": years[0] if len(years) == 1 else None,
        "sourceFile": Path(xlsx_path).name,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "tables": tables,
    }
    out_path = out_dir / f"{report_id}.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path.name}: " + "; ".join(f"{t['key']} ({len(t['rows'])} rows, totals {t['totals']})" for t in tables))
    print(f"Academic year: {report['academicYear'] or 'not stated in the titles'}")
    for warning in warnings:
        print(f"  check: {warning}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("report", choices=sorted(REPORTS))
    parser.add_argument("xlsx", help="Path to the report workbook (.xlsx)")
    parser.add_argument("--out-dir", type=Path, default=HERE)
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    build(args.report, args.xlsx, args.out_dir)


if __name__ == "__main__":
    main()
