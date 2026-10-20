"""Builds the synthetic client-list fixtures used by the import tests:
tests/fixtures/clients-synthetic.csv and clients-synthetic.xlsx (same data, the
columns of a Fresha client-list export). Every person here is fake
("Test Client 1", 0400 000 001...). Never put real rows in these files.

    python tests/fixtures/make-clients-fixture.py
"""
import csv
import io
import os
import zipfile
from xml.sax.saxutils import escape

HEADERS = [
    "Client ID", "First Name", "Last Name", "Full Name", "Blocked", "Block Reason",
    "Gender", "Mobile Number", "Telephone", "Email", "Accepts Marketing",
    "Accepts SMS Marketing", "Address", "Apartement Suite", "Area", "City", "State",
    "Post Code", "Date of Birth", "Added", "Staff alert", "Referral Source", "Tags",
]


def row(**kw):
    r = {h: "" for h in HEADERS}
    r.update({"Blocked": "No", "Accepts Marketing": "Yes", "Accepts SMS Marketing": "Yes"})
    r.update(kw)
    return r


ROWS = [
    row(**{"Client ID": "900000001", "Full Name": "Test Client 1", "Mobile Number": "61 400 000 001", "Added": "2026-01-10", "Referral Source": "Walk-In"}),
    row(**{"Client ID": "900000002", "Full Name": "Test Client 2", "Mobile Number": "61 400 000 002", "Added": "2026-01-11"}),
    row(**{"Client ID": "900000003", "Full Name": "Test Client 3", "Mobile Number": "0400 000 003", "Added": "2026-01-12"}),
    row(**{"Client ID": "900000004", "Full Name": "Test Client 4", "Mobile Number": "61 400 000 004", "Added": "2026-01-13",
           "Email": "test.client4@example.test", "Gender": "Female", "Blocked": "Yes", "Block Reason": "Test reason",
           "Telephone": "+61 3 9000 0001", "Staff alert": "Fake staff alert text"}),
    row(**{"Client ID": "900000005", "Full Name": "Shared Older", "Mobile Number": "61 400 000 005", "Added": "2026-02-01"}),
    row(**{"Client ID": "900000006", "Full Name": "Shared Newer", "Mobile Number": "61 400 000 005", "Added": "2026-03-01"}),
    row(**{"Client ID": "900000007", "First Name": "Test", "Last Name": "Split", "Mobile Number": "61 400 000 006", "Added": "2026-01-14"}),
    row(**{"Client ID": "900000008", "Full Name": "No Phone Client", "Mobile Number": "", "Added": "2026-01-15"}),
    row(**{"Client ID": "900000009", "Full Name": "Overseas Client", "Mobile Number": "44 7700 900123", "Added": "2026-01-16"}),
    row(**{"Client ID": "900000010", "Full Name": "", "Mobile Number": "61 400 000 007", "Added": "2026-01-17"}),
    row(**{"Client ID": "900000011", "Full Name": "Test   Ünïcöde  Client", "Mobile Number": "61 400 000 008", "Added": "2026-01-18"}),
    row(**{"Client ID": "900000012", "Full Name": "Landline Client", "Mobile Number": "61 3 9000 0000", "Added": "2026-01-19"}),
    row(**{"Client ID": "900000013", "Full Name": "Existing Client", "Mobile Number": "61 400 000 009", "Added": "2026-01-20"}),
    row(**{"Client ID": "900000014", "Full Name": "Test Client 10", "Mobile Number": "61 400 000 010", "Added": "2026-01-21"}),
]

here = os.path.dirname(os.path.abspath(__file__))

# ── CSV: as Fresha writes it (ISO dates, a blank last line) ───────────────────
buf = io.StringIO()
w = csv.writer(buf, lineterminator="\n")
w.writerow(HEADERS)
for r in ROWS:
    w.writerow([r[h] for h in HEADERS])
open(os.path.join(here, "clients-synthetic.csv"), "w", encoding="utf-8", newline="").write(buf.getvalue() + "\n")


# ── XLSX: one sheet, shared strings, "Added" as an Excel date serial ──────────
def serial(iso):
    import datetime
    y, m, d = map(int, iso.split("-"))
    return (datetime.date(y, m, d) - datetime.date(1899, 12, 30)).days


strings, index = [], {}


def sst(s):
    if s not in index:
        index[s] = len(strings)
        strings.append(s)
    return index[s]


def col(i):
    return chr(ord("A") + i)


rows_xml = []
cells = "".join(f'<c r="{col(i)}1" t="s"><v>{sst(h)}</v></c>' for i, h in enumerate(HEADERS))
rows_xml.append(f'<row r="1">{cells}</row>')
for n, r in enumerate(ROWS, start=2):
    cells = []
    for i, h in enumerate(HEADERS):
        v = r[h]
        if v == "":
            continue
        ref = f"{col(i)}{n}"
        if h == "Added":
            cells.append(f'<c r="{ref}" s="1"><v>{serial(v)}</v></c>')
        else:
            cells.append(f'<c r="{ref}" t="s"><v>{sst(v)}</v></c>')
    rows_xml.append(f'<row r="{n}">{"".join(cells)}</row>')

NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
files = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook {NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Client List Report" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml": f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet {NS}><numFmts count="0"/><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml": f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet {NS}><dimension ref="A1:W{len(ROWS) + 1}"/><sheetData>{"".join(rows_xml)}</sheetData></worksheet>',
}
files["xl/sharedStrings.xml"] = (
    f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst {NS} count="{len(strings)}" uniqueCount="{len(strings)}">'
    + "".join(f'<si><t xml:space="preserve">{escape(s)}</t></si>' for s in strings)
    + "</sst>"
)
with zipfile.ZipFile(os.path.join(here, "clients-synthetic.xlsx"), "w", zipfile.ZIP_DEFLATED) as z:
    for name, data in files.items():
        z.writestr(name, data)
print("wrote", len(ROWS), "synthetic rows")
