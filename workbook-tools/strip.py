"""Take the plan sheets (sheetId >= 101, added by merge.py) out of a combined workbook, so a rebuilt set can be merged
again with merge.py. Works at XML level: the weekly sheets, Power Queries, connections, query tables and Data Model
stay byte-identical. The calc chain is dropped (Excel rebuilds it).

usage: strip.py combined.xlsx weekly_only.xlsx"""
import sys, re, os, zipfile, posixpath, html

src, out = sys.argv[1:3]
z = zipfile.ZipFile(src)
files = {i.filename: z.read(i.filename) for i in z.infolist()}
order = [i.filename for i in z.infolist()]
def s(p): return files[p].decode("utf8")
def attr(tag, name):
    m = re.search(r'\b%s="([^"]*)"' % re.escape(name), tag); return m.group(1) if m else None
def rels_of(part): return posixpath.join(posixpath.dirname(part), "_rels", posixpath.basename(part) + ".rels")
def resolve(base, tgt): return tgt.lstrip("/") if tgt.startswith("/") else posixpath.normpath(posixpath.join(posixpath.dirname(base), tgt))

wb, wrels = s("xl/workbook.xml"), s("xl/_rels/workbook.xml.rels")
relmap = {attr(m, "Id"): attr(m, "Target") for m in re.findall(r"<Relationship\b[^>]*>", wrels)}
sheets = re.findall(r"<sheet\b[^>]*/>", wb)
drop_tags = [t for t in sheets if int(attr(t, "sheetId")) >= 101]
if not drop_tags: raise SystemExit("no plan sheets (sheetId >= 101) in this workbook")
gone = set(); drop_rids = []
for t in drop_tags:
    rid = attr(t, "r:id"); drop_rids.append(rid)
    part = resolve("xl/workbook.xml", relmap[rid])
    todo = [part]
    while todo:                                   # the sheet and everything only it uses (tables, drawings, charts …)
        p = todo.pop(); gone.add(p)
        rp = rels_of(p)
        if rp in files:
            gone.add(rp)
            for m in re.findall(r"<Relationship\b[^>]*>", s(rp)):
                if attr(m, "TargetMode") == "External": continue
                q = resolve(p, attr(m, "Target"))
                if q in files and q not in gone: todo.append(q)
n_drop = len(drop_tags)
idx_drop = [sheets.index(t) for t in drop_tags]
assert idx_drop == list(range(n_drop)), "plan sheets are expected first (as merge.py puts them)"
# workbook.xml: sheets, defined names (cfg_* come back with the new sheets), local sheet ids
for t in drop_tags: wb = wb.replace(t, "", 1)
def dn(m):
    t = m.group(0); name = attr(t, "name") or ""
    if name.startswith("cfg_"): return ""
    l = attr(t, "localSheetId")
    if l is not None:
        l = int(l)
        if l < n_drop: return ""
        t = re.sub(r'localSheetId="\d+"', 'localSheetId="%d"' % (l - n_drop), t, count=1)
    return t
wb = re.sub(r"<definedName\b[^>]*>.*?</definedName>", dn, wb, flags=re.S)
wb = re.sub(r'activeTab="\d+"', 'activeTab="0"', wb); wb = re.sub(r'firstSheet="\d+"', 'firstSheet="0"', wb)
files["xl/workbook.xml"] = wb.encode("utf8")
# workbook rels + calc chain
for rid in drop_rids: wrels = re.sub(r'<Relationship\b[^>]*\bId="%s"[^>]*/>' % rid, "", wrels)
for m in re.findall(r"<Relationship\b[^>]*>", wrels):
    if attr(m, "Type").endswith("/calcChain"):
        wrels = wrels.replace(m, ""); gone.add(resolve("xl/workbook.xml", attr(m, "Target")))
files["xl/_rels/workbook.xml.rels"] = wrels.encode("utf8")
# content types
ct = s("[Content_Types].xml")
for p in gone: ct = re.sub(r'<Override PartName="/%s"[^>]*/>' % re.escape(p), "", ct)
files["[Content_Types].xml"] = ct.encode("utf8")
for p in gone: files.pop(p, None)
# no sheet left selected
for p in list(files):
    if p.startswith("xl/worksheets/sheet") and p.endswith(".xml"): files[p] = files[p].replace(b' tabSelected="1"', b"")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zo:
    for p in [f for f in order if f in files]: zo.writestr(p, files[p])
print("removed", n_drop, "sheets:", [html.unescape(attr(t, "name")) for t in drop_tags], "·", len(gone), "parts")
