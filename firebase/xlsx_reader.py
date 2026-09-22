"""Minimal .xlsx reader using only the Python standard library.

    with Workbook("file.xlsx") as workbook:
        for row_number, cells in workbook.rows("Sheet1"):
            ...  # cells maps a 0-based column index to the cell text

Rows are streamed, so large sheets do not need to fit in memory.
"""
import re
import zipfile
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def column_index(ref):
    index = 0
    for char in re.match(r"[A-Z]+", ref).group(0):
        index = index * 26 + ord(char) - 64
    return index - 1


class Workbook:
    def __init__(self, path):
        self.archive = zipfile.ZipFile(path)
        self.strings = self._shared_strings()
        self.sheet_paths = self._sheet_paths()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.archive.close()

    @property
    def sheet_names(self):
        return list(self.sheet_paths)

    def rows(self, sheet):
        for _, element in ET.iterparse(self.archive.open(self.sheet_paths[sheet])):
            if element.tag != f"{NS}row":
                continue
            cells = {}
            for cell in element.findall(f"{NS}c"):
                value = cell.find(f"{NS}v")
                if cell.get("t") == "inlineStr":
                    text = "".join(t.text or "" for t in cell.iter(f"{NS}t"))
                elif value is None:
                    continue
                elif cell.get("t") == "s":
                    text = self.strings[int(value.text)]
                else:
                    text = value.text
                cells[column_index(cell.get("r"))] = text
            number = int(element.get("r"))
            element.clear()
            yield number, cells

    def _shared_strings(self):
        if "xl/sharedStrings.xml" not in self.archive.namelist():
            return []
        strings = []
        for _, element in ET.iterparse(self.archive.open("xl/sharedStrings.xml")):
            if element.tag == f"{NS}si":
                strings.append("".join(text.text or "" for text in element.iter(f"{NS}t")))
                element.clear()
        return strings

    def _sheet_paths(self):
        workbook = ET.parse(self.archive.open("xl/workbook.xml")).getroot()
        rels = ET.parse(self.archive.open("xl/_rels/workbook.xml.rels")).getroot()
        targets = {rel.get("Id"): rel.get("Target").lstrip("/") for rel in rels}
        paths = {}
        for sheet in workbook.find(f"{NS}sheets"):
            target = targets[sheet.get(REL_ID)]
            paths[sheet.get("name")] = target if target.startswith("xl/") else f"xl/{target}"
        return paths
