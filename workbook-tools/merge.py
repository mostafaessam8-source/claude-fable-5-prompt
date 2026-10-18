"""Move the new sheets (built by build.py, values from LibreOffice) into the weekly workbook package
at XML level, so its Power Queries, connections, query tables and Data Model stay untouched.

usage: merge.py weekly.xlsx new.xlsx new_calc.xlsx out_dir out.xlsx"""
import sys, re, os, shutil, zipfile, datetime, html
import openpyxl

wk_p, new_p, calc_p, out_dir, out_p = sys.argv[1:6]
SKIP = {"Weekly Report Updates"}           # value copy used only for recalculation
HIDE = {"Project Milestones Progress ", "Master Plan", "Old_PBI", "Sheet1 (2)"}
MANUAL = {"PMO Issue", "Sheet1", "Sheet1 (2)"}
GREEN, TEAL = "FF2E7D32", "FF00778B"

if os.path.exists(out_dir): shutil.rmtree(out_dir)
with zipfile.ZipFile(wk_p) as z: z.extractall(out_dir)
nz = zipfile.ZipFile(new_p)
def nread(p): return nz.read(p).decode("utf8")
def rd(p): return open(os.path.join(out_dir, p), encoding="utf8").read()
def wr(p, s):
    os.makedirs(os.path.dirname(os.path.join(out_dir, p)), exist_ok=True)
    open(os.path.join(out_dir, p), "w", encoding="utf8").write(s)
def attr(tag, name):
    m = re.search(r'\b%s="([^"]*)"' % re.escape(name), tag); return m.group(1) if m else None
def children(xml, parent, child):
    m = re.search(r"<%s\b[^>]*?(?:/>|>(.*?)</%s>)" % (parent, parent), xml, re.S)
    if not m or m.group(1) is None: return []
    return re.findall(r"<%s\b[^>]*/>|<%s\b[^>]*>.*?</%s>" % (child, child, child), m.group(1), re.S)

# ------------------------------------------------------------------ styles
ws_ = rd("xl/styles.xml"); ns_ = nread("xl/styles.xml")
def count(xml, parent): return len(children(xml, parent, {"fonts": "font", "fills": "fill", "borders": "border", "cellXfs": "xf", "dxfs": "dxf", "numFmts": "numFmt"}[parent]))
fo, fi, bo, xo, do = count(ws_, "fonts"), count(ws_, "fills"), count(ws_, "borders"), count(ws_, "cellXfs"), count(ws_, "dxfs")
old_ids = [int(x) for x in re.findall(r'<numFmt numFmtId="(\d+)"', ws_)]
nxt = max(old_ids + [163]) + 1
nf_map, new_numfmts = {}, []
for nf in children(ns_, "numFmts", "numFmt"):
    i = int(attr(nf, "numFmtId")); code = attr(nf, "formatCode")
    same = re.search(r'<numFmt numFmtId="(\d+)" formatCode="%s"' % re.escape(code), ws_)
    if same: nf_map[i] = int(same.group(1)); continue
    nf_map[i] = nxt; new_numfmts.append('<numFmt numFmtId="%d" formatCode="%s"/>' % (nxt, code)); nxt += 1
def remap_xf(x):
    def sub(name, fn):
        nonlocal x
        x = re.sub(r'\b%s="(\d+)"' % name, lambda m: '%s="%d"' % (name, fn(int(m.group(1)))), x, count=1)
    sub("numFmtId", lambda i: nf_map.get(i, i)); sub("fontId", lambda i: i + fo); sub("fillId", lambda i: i + fi)
    sub("borderId", lambda i: i + bo); sub("xfId", lambda i: 0)
    return x
add = {
    "fonts": children(ns_, "fonts", "font"), "fills": children(ns_, "fills", "fill"), "borders": children(ns_, "borders", "border"),
    "cellXfs": [remap_xf(x) for x in children(ns_, "cellXfs", "xf")], "dxfs": children(ns_, "dxfs", "dxf"), "numFmts": new_numfmts,
}
for parent, items in add.items():
    if not items: continue
    m = re.search(r"<%s\b([^>]*)>" % parent, ws_)
    if not m:   # no such block yet (e.g. dxfs) – not expected for this workbook
        raise SystemExit("styles: missing <%s>" % parent)
    n = count(ws_, parent) + len(items)
    head = re.sub(r'count="\d+"', 'count="%d"' % n, m.group(0))
    ws_ = ws_[:m.start()] + head + ws_[m.end():]
    ws_ = ws_.replace("</%s>" % parent, "".join(items) + "</%s>" % parent, 1)
wr("xl/styles.xml", ws_)
print("styles: +%d fonts +%d fills +%d borders +%d xfs (offset %d) +%d dxfs (offset %d) +%d numFmts" % (
    len(add["fonts"]), len(add["fills"]), len(add["borders"]), len(add["cellXfs"]), xo, len(add["dxfs"]), do, len(new_numfmts)))

# ------------------------------------------------------------------ new workbook structure
nwb = nread("xl/workbook.xml"); nrels = nread("xl/_rels/workbook.xml.rels")
relmap = {attr(m, "Id"): attr(m, "Target") for m in re.findall(r"<Relationship\b[^>]*>", nrels)}
nsheets = [(html.unescape(attr(m, "name")), relmap[attr(m, "r:id")]) for m in re.findall(r"<sheet\b[^>]*>", nwb)]
nsheets = [(n, t if t.startswith("/") else "xl/" + t) for n, t in nsheets]
nsheets = [(n, t.lstrip("/")) for n, t in nsheets if n not in SKIP]
sst = [html.unescape(re.sub(r"<[^>]+>", "", s)) for s in re.findall(r"<si>(.*?)</si>", nread("xl/sharedStrings.xml"), re.S)] if "xl/sharedStrings.xml" in nz.namelist() else []
calc = openpyxl.load_workbook(calc_p, data_only=True)
EPOCH = datetime.datetime(1899, 12, 30)
def esc(s): return html.escape(s, quote=False)

def cached(ws, ref):
    v = ws[ref].value
    if v is None: return ' t="str"', "<v></v>"
    if isinstance(v, bool): return ' t="b"', "<v>%d</v>" % v
    if isinstance(v, datetime.datetime):
        d = v - EPOCH; return "", "<v>%s</v>" % repr(d.days + d.seconds / 86400.0).rstrip("0").rstrip(".")
    if isinstance(v, (int, float)): return "", "<v>%s</v>" % repr(v)
    s = str(v)
    if s.startswith("#"): return ' t="e"', "<v>%s</v>" % esc(s)
    return ' t="str"', "<v>%s</v>" % esc(s)

ct = rd("[Content_Types].xml"); wrels = rd("xl/_rels/workbook.xml.rels")
ct_add = []
new_sheet_entries, sid, rid, tid, n_tables = [], 101, 101, 101, 0
for idx, (name, path) in enumerate(nsheets):
    xml = nread(path)
    ws = calc[name]
    # cells
    def fix_cell(m):
        tag, body = m.group(1), m.group(2)
        ref = attr(tag, "r")
        tag = re.sub(r'\bs="(\d+)"', lambda k: 's="%d"' % (int(k.group(1)) + xo), tag)
        if body is None: return tag + "/>"
        if "<f>" in body or "<f " in body:
            f = re.search(r"<f\b.*?</f>|<f\b[^>]*/>", body, re.S).group(0)
            t, v = cached(ws, ref)
            tag = re.sub(r'\st="[^"]*"', "", tag) + t
            return tag + ">" + f + v + "</c>"
        if attr(tag, "t") == "s":
            i = int(re.search(r"<v>(\d+)</v>", body).group(1))
            tag = re.sub(r'\st="s"', ' t="inlineStr"', tag)
            return tag + '><is><t xml:space="preserve">%s</t></is></c>' % esc(sst[i])
        return tag + ">" + body + "</c>"
    xml = re.sub(r"(<c\b[^>]*?)(?:/>|>(.*?)</c>)", fix_cell, xml, flags=re.S)
    xml = re.sub(r'(<row\b[^>]*?\bs=")(\d+)"', lambda k: '%s%d"' % (k.group(1), int(k.group(2)) + xo), xml)
    xml = re.sub(r'(<col\b[^>]*?\bstyle=")(\d+)"', lambda k: '%s%d"' % (k.group(1), int(k.group(2)) + xo), xml)
    xml = re.sub(r'\bdxfId="(\d+)"', lambda k: 'dxfId="%d"' % (int(k.group(1)) + do), xml)
    if idx == 0: xml = re.sub(r"<sheetView\b", '<sheetView tabSelected="1"', xml, count=1) if "tabSelected" not in xml else xml
    else: xml = xml.replace(' tabSelected="1"', "")
    target = "xl/worksheets/sheet%d.xml" % sid
    # rels (tables, drawings)
    rp = os.path.dirname(path) + "/_rels/" + os.path.basename(path) + ".rels"
    if rp in nz.namelist():
        rels = nread(rp)
        def fix_rel(m):
            global tid
            r = m.group(0); tgt = attr(r, "Target")
            full = tgt[1:] if tgt.startswith("/") else os.path.normpath(os.path.join(os.path.dirname(path), tgt)).replace("\\", "/")
            if "/tables/" in full:
                txml = nread(full)
                txml = re.sub(r'(<table\b[^>]*?\bid=")(\d+)"', lambda k: '%s%d"' % (k.group(1), tid), txml, count=1)
                newp = "xl/tables/table%d.xml" % tid; wr(newp, txml)
                ct_add.append('<Override PartName="/%s" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>' % newp)
                tid += 1
                return r.replace('Target="%s"' % tgt, 'Target="../tables/%s"' % os.path.basename(newp))
            if "/drawings/" in full:
                dxml = nread(full); newd = "xl/drawings/drawing%d.xml" % sid
                drp = "xl/drawings/_rels/" + os.path.basename(full) + ".rels"
                drels = nread(drp)
                for cm in re.findall(r'Target="([^"]+)"', drels):
                    cfull = cm[1:] if cm.startswith("/") else os.path.normpath(os.path.join("xl/drawings", cm)).replace("\\", "/")
                    newc = "xl/charts/chart%d%02d.xml" % (sid, len(ct_add))
                    wr(newc, nread(cfull)); drels = drels.replace('Target="%s"' % cm, 'Target="../charts/%s"' % os.path.basename(newc))
                    ct_add.append('<Override PartName="/%s" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>' % newc)
                wr(newd, dxml); wr("xl/drawings/_rels/%s.rels" % os.path.basename(newd), drels)
                ct_add.append('<Override PartName="/%s" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' % newd)
                return r.replace('Target="%s"' % tgt, 'Target="../drawings/%s"' % os.path.basename(newd))
            raise SystemExit("unexpected sheet relationship: " + r)
        rels = re.sub(r"<Relationship\b[^>]*>", fix_rel, rels)
        wr("xl/worksheets/_rels/sheet%d.xml.rels" % sid, rels)
    wr(target, xml)
    ct_add.append('<Override PartName="/%s" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' % target)
    wrels = wrels.replace("</Relationships>", '<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/></Relationships>' % (rid, sid))
    new_sheet_entries.append('<sheet name="%s" sheetId="%d" r:id="rId%d"/>' % (html.escape(name), sid, rid))
    sid += 1; rid += 1
ct = ct.replace("</Types>", "".join(ct_add) + "</Types>")
wr("[Content_Types].xml", ct); wr("xl/_rels/workbook.xml.rels", wrels)
N = len(new_sheet_entries)

# ------------------------------------------------------------------ workbook.xml
wb = rd("xl/workbook.xml")
old_names = [html.unescape(attr(m, "name")) for m in re.findall(r"<sheet\b[^>]*>", wb)]
def hide(m):
    t = m.group(0); n = html.unescape(attr(t, "name"))
    return t.replace("<sheet ", '<sheet state="hidden" ', 1) if n in HIDE and "state=" not in t else t
wb = re.sub(r"<sheet\b[^>]*>", hide, wb)
wb = wb.replace("<sheets>", "<sheets>" + "".join(new_sheet_entries), 1)
wb = re.sub(r'localSheetId="(\d+)"', lambda k: 'localSheetId="%d"' % (int(k.group(1)) + N), wb)
newdn = re.findall(r"<definedName\b[^>]*>.*?</definedName>", nwb, re.S)
newdn = [d for d in newdn if "_xlnm" not in d]
wb = wb.replace("</definedNames>", "".join(newdn) + "</definedNames>", 1)
wb = re.sub(r'firstSheet="\d+"', 'firstSheet="0"', wb); wb = re.sub(r'activeTab="\d+"', 'activeTab="0"', wb)
wb = re.sub(r"<calcPr\b([^>]*?)/>", lambda k: "<calcPr" + re.sub(r'\sfullCalcOnLoad="\d"', "", k.group(1)) + ' fullCalcOnLoad="1"/>', wb, count=1)
wr("xl/workbook.xml", wb)

# ------------------------------------------------------------------ weekly sheets: tab colours, no tab selected
orels = {attr(m, "Id"): attr(m, "Target") for m in re.findall(r"<Relationship\b[^>]*>", wrels)}
for m in re.findall(r"<sheet\b[^>]*>", rd("xl/workbook.xml")):
    n = html.unescape(attr(m, "name")); p = "xl/" + orels[attr(m, "r:id")]
    if attr(m, "sheetId") and int(attr(m, "sheetId")) >= 101: continue
    x = rd(p).replace(' tabSelected="1"', "")
    col = TEAL if n in MANUAL else GREEN
    if re.search(r"<sheetPr\b[^>]*/>", x):
        x = re.sub(r"<sheetPr\b([^>]*)/>", r'<sheetPr\1><tabColor rgb="%s"/></sheetPr>' % col, x, count=1)
    elif "<sheetPr" in x and "<tabColor" not in x:
        x = re.sub(r"(<sheetPr\b[^>]*>)", r'\1<tabColor rgb="%s"/>' % col, x, count=1)
    elif "<sheetPr" not in x:
        x = re.sub(r"(<worksheet\b[^>]*>)", r'\1<sheetPr><tabColor rgb="%s"/></sheetPr>' % col, x, count=1)
    wr(p, x)

# ------------------------------------------------------------------ docProps/app.xml
app = rd("docProps/app.xml")
allnames = [n for n, _ in nsheets] + old_names
app = re.sub(r"(<vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>)\d+", lambda k: k.group(1) + str(len(allnames)), app)
app = re.sub(r'<TitlesOfParts><vt:vector size="\d+" baseType="lpstr">.*?</vt:vector></TitlesOfParts>',
             '<TitlesOfParts><vt:vector size="%d" baseType="lpstr">%s</vt:vector></TitlesOfParts>' % (
                 len(allnames), "".join("<vt:lpstr>%s</vt:lpstr>" % html.escape(n) for n in allnames)), app, flags=re.S)
wr("docProps/app.xml", app)

# ------------------------------------------------------------------ zip (keep the original part order, [Content_Types] first)
with zipfile.ZipFile(wk_p) as z: order = [i.filename for i in z.infolist()]
allf = []
for root, _, files in os.walk(out_dir):
    for f in files: allf.append(os.path.relpath(os.path.join(root, f), out_dir).replace("\\", "/"))
seq = [f for f in order if f in allf] + sorted(f for f in allf if f not in order)
if os.path.exists(out_p): os.remove(out_p)
with zipfile.ZipFile(out_p, "w", zipfile.ZIP_DEFLATED) as z:
    for f in seq: z.write(os.path.join(out_dir, f), f)
print("wrote", out_p, "sheets:", [n for n, _ in nsheets], "+", len(old_names), "weekly sheets;", tid - 101, "tables")
