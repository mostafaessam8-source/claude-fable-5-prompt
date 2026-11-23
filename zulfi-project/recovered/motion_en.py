import json, sys, zipfile, shutil, os, re
from lxml import etree
NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
P = '{%s}' % NS['p']
src, dst = sys.argv[1], sys.argv[2]
anim = json.load(open('anim.json'))
TRANS = {str(k): '<p:fade/>' for k in range(1, 40)}
FXMAP = {'fade': 'fade', 'wipe': 'wipe', 'zoom': 'wipe', 'fly': 'wipe'}
_id = [10]
def nid():
    _id[0] += 1; return _id[0]
def tgt(spid): return '<p:tgtEl><p:spTgt spid="%d"/></p:tgtEl>' % spid
def effect(spid, fx, node, delay, dur=500):
    pid = {'fade': (10, 0), 'wipe': (22, 8), 'zoom': (53, 16), 'fly': (2, 4)}[fx]
    c = nid(); setc = nid(); a1 = nid()
    body = '<p:set><p:cBhvr><p:cTn id="%d" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>%s<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>' % (setc, tgt(spid))
    if fx == 'fade':
        body += '<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="%d" dur="%d"/>%s</p:cBhvr></p:animEffect>' % (a1, dur, tgt(spid))
    elif fx == 'wipe':
        body += '<p:animEffect transition="in" filter="wipe(left)"><p:cBhvr><p:cTn id="%d" dur="%d"/>%s</p:cBhvr></p:animEffect>' % (a1, dur, tgt(spid))
    elif fx == 'zoom':
        body += '<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="%d" dur="%d"/>%s</p:cBhvr></p:animEffect>' % (a1, dur, tgt(spid))
        for attr in ('ppt_w', 'ppt_h'):
            body += ('<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="%d" dur="%d" fill="hold"/>%s<p:attrNameLst><p:attrName>%s</p:attrName></p:attrNameLst></p:cBhvr>'
                     '<p:tavLst><p:tav tm="0"><p:val><p:fltVal val="0"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#%s"/></p:val></p:tav></p:tavLst></p:anim>') % (nid(), dur, tgt(spid), attr, attr)
    elif fx == 'fly':
        body += '<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="%d" dur="%d" fill="hold"/>%s<p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_x"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_x"/></p:val></p:tav></p:tavLst></p:anim>' % (nid(), dur, tgt(spid))
        body += '<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="%d" dur="%d" fill="hold"/>%s<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="1+#ppt_h/2"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav></p:tavLst></p:anim>' % (nid(), dur, tgt(spid))
        body += '<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="%d" dur="%d"/>%s</p:cBhvr></p:animEffect>' % (nid(), dur, tgt(spid))
    return ('<p:par><p:cTn id="%d" presetID="%d" presetClass="entr" presetSubtype="%d" fill="hold" grpId="0" nodeType="%s"><p:stCondLst><p:cond delay="%d"/></p:stCondLst><p:childTnLst>%s</p:childTnLst></p:cTn></p:par>'
            % (c, pid[0], pid[1], node, delay, body))
def timing(steps, ids, textids):
    _id[0] = 2
    mids = ''; t = 0
    for st in steps:
        eff = ''
        for k, e in enumerate(st):
            if e['name'] not in ids: continue
            eff += effect(ids[e['name']], FXMAP[e['fx']], 'afterEffect' if k == 0 else 'withEffect', 0 if k == 0 else 0)
        if not eff: continue
        mids += '<p:par><p:cTn id="%d" fill="hold"><p:stCondLst><p:cond delay="%d"/></p:stCondLst><p:childTnLst>%s</p:childTnLst></p:cTn></p:par>' % (nid(), t, eff)
        t += st[0].get('gap', 450)
    outer_id = nid()
    bld = ''.join('<p:bldP spid="%d" grpId="0" animBg="1"/>' % i for i in sorted(textids))
    xml = ('<p:timing xmlns:p="%s"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
           '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
           '<p:par><p:cTn id="%d" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>%s</p:childTnLst></p:cTn></p:par>'
           '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
           '</p:childTnLst></p:cTn></p:par></p:tnLst>%s</p:timing>') % (NS['p'], outer_id, mids, '<p:bldLst>%s</p:bldLst>' % bld if bld else '')
    return etree.fromstring(xml)

A_AR = re.compile(r'[\u0600-\u06FF]')
AN = 'http://schemas.openxmlformats.org/drawingml/2006/main'
def fix_fonts(root):
    for p in root.iter('{%s}p' % AN):
        txt = ''.join(t.text or '' for t in p.iter('{%s}t' % AN))
        ar = bool(A_AR.search(txt))
        ppr = p.find('{%s}pPr' % AN)
        if ar and ppr is not None: ppr.set('rtl', '1')
        for r in p.iter('{%s}r' % AN):
            t = r.find('{%s}t' % AN); rp = r.find('{%s}rPr' % AN)
            if rp is None: continue
            rar = bool(A_AR.search(t.text or ''))
            face = '29LT Kaff' if rar else 'Diodrum Arabic'
            rp.set('lang', 'ar-SA' if rar else 'en-US')
            for tag in ('latin', 'ea', 'cs', 'sym'):
                for e in rp.findall('{%s}%s' % (AN, tag)): rp.remove(e)
            for tag in ('latin', 'cs'):
                e = etree.SubElement(rp, '{%s}%s' % (AN, tag)); e.set('typeface', face)
        for e in p.findall('{%s}endParaRPr' % AN):
            e.set('lang', 'ar-SA' if ar else 'en-US')
    # chart / table cells handled by the same walk

tmp = 'm_tmp'; shutil.rmtree(tmp, ignore_errors=True)
zipfile.ZipFile(src).extractall(tmp)
import glob as _g
for n in range(1, len(_g.glob(tmp + '/ppt/slides/slide*.xml')) + 1):
    f = '%s/ppt/slides/slide%d.xml' % (tmp, n)
    tree = etree.parse(f); root = tree.getroot()
    fix_fonts(root)
    ids = {}; textids = set()
    for sp in root.iter(P + 'sp', P + 'pic', P + 'graphicFrame', P + 'cxnSp'):
        nv = sp.find('.//' + P + 'cNvPr')
        if sp.tag == P + 'sp':
            tx = ''.join(t.text or '' for t in sp.iter('{%s}t' % NS['a'])).strip()
            if tx and nv is not None: ids.setdefault('t:' + tx, int(nv.get('id')))
        if nv is not None and nv.get('name'):
            ids[nv.get('name')] = int(nv.get('id'))
            if sp.tag == P + 'sp' and sp.find('.//{%s}t' % NS['a']) is not None: textids.add(int(nv.get('id')))
    steps = anim.get(str(n), [])
    animated = {e['name'] for st in steps for e in st}
    miss = animated - set(ids)
    if miss: print('slide', n, 'missing', miss)
    tr = etree.fromstring('<p:transition xmlns:p="%s" spd="med">%s</p:transition>' % (NS['p'], TRANS[str(n)]))
    tm = timing(steps, ids, {ids[x] for x in animated if x in ids and ids[x] in textids})
    clr = root.find(P + 'clrMapOvr')
    pos = list(root).index(clr) + 1 if clr is not None else len(root)
    root.insert(pos, tr); root.insert(pos + 1, tm)
    tree.write(f, xml_declaration=True, encoding='UTF-8', standalone=True)

import glob
for cf in glob.glob(tmp + '/ppt/charts/chart*.xml'):
    ct = etree.parse(cf)
    for rp in list(ct.getroot().iter('{%s}defRPr' % AN, '{%s}rPr' % AN)):
        lat = rp.find('{%s}latin' % AN)
        if lat is None: continue
        face = lat.get('typeface')
        for e in rp.findall('{%s}ea' % AN) + rp.findall('{%s}cs' % AN): rp.remove(e)
        for k in ('pitchFamily', 'charset'):
            if k in lat.attrib: del lat.attrib[k]
        c = etree.Element('{%s}cs' % AN); c.set('typeface', face); lat.addnext(c)
    ct.write(cf, xml_declaration=True, encoding='UTF-8', standalone=True)

if os.path.exists(dst): os.remove(dst)
z = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
# content types first
order = ['[Content_Types].xml']
for dp, dn, fn in os.walk(tmp):
    for x in fn:
        rel = os.path.relpath(os.path.join(dp, x), tmp)
        if rel not in order: order.append(rel)
for rel in order: z.write(os.path.join(tmp, rel), rel)
z.close(); print('motion ok')
