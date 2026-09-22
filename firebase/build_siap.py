"""Extract dashboard columns from the SIAP worksheet for the protected CSV import.

Usage: python firebase/build_siap.py source.xlsx output.csv
The Stops worksheet is derived route data, not additional interns.
"""
import csv
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

from xlsx_reader import Workbook, NS


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
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    with Path(output).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow([header for header, _ in selected])
        writer.writerows(records)
    print(f"Prepared {len(records):,} SIAP records with {len(selected)} dashboard columns. Stops excluded.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python firebase/build_siap.py source.xlsx output.csv")
    build(sys.argv[1], sys.argv[2])
