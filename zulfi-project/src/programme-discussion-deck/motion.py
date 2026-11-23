"""Post-process a pptxgenjs file: slide transition + inner entrance animation (fade / wipe) per anim.json.
usage: python3 motion.py stage.pptx out.pptx"""
import json, sys, zipfile, shutil, os, re, glob
from lxml import etree

NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
P = '{%s}' % NS['p']; AN = NS['a']
src, dst = sys.argv[1], sys.argv[2]
anim = json.load(open('anim.json'))
_id = [10]
def nid():
    _id[0] += 1; return _id[0]
def tgt(spid): return '<p:tgtEl><p:spTgt spid="%d"/></p:tgtEl>' % spid
PRESET = {'fade': (10, 0), 'wipe': (22, 8)}

def effect(spid, fx, node, dur=500):
    pid = PRESET[fx]
    c, st, a1 = nid(), nid(), nid()
    body = ('<p:set><p:cBhvr><p:cTn id="%d" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>%s<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>' % (st, tgt(spid)))
    flt = 'fade' if fx == 'fade' else 'wipe(left)'
    body += '<p:animEffect transition="in" filter="%s"><p:cBhvr><p:cTn id="%d" dur="%d"/>%s</p:cBhvr></p:animEffect>' % (flt, a1, dur, tgt(spid))
    return ('<p:par><p:cTn id="%d" presetID="%d" presetClass="entr" presetSubtype="%d" fill="hold" grpId="0" nodeType="%s"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>%s</p:childTnLst></p:cTn></p:par>'
            % (c, pid[0], pid[1], node, body))

def timing(steps, ids, textids):
    _id[0] = 2
    mids = ''; t = 0
    for st in steps:
        eff = ''
        k = 0
        for e in st:
            if e['name'] not in ids: continue
            eff += effect(ids[e['name']], e['fx'], 'afterEffect' if k == 0 else 'withEffect'); k += 1
        if not eff: continue
        mids += '<p:par><p:cTn id="%d" fill="hold"><p:stCondLst><p:cond delay="%d"/></p:stCondLst><p:childTnLst>%s</p:childTnLst></p:cTn></p:par>' % (nid(), t, eff)
        t += st[0].get('gap', 450)
    outer = nid()
    bld = ''.join('<p:bldP spid="%d" grpId="0" animBg="1"/>' % i for i in sorted(textids))
    xml = ('<p:timing xmlns:p="%s"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
           '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
           '<p:par><p:cTn id="%d" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>%s</p:childTnLst></p:cTn></p:par>'
           '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
           '</p:childTnLst></p:cTn></p:par></p:tnLst>%s</p:timing>') % (NS['p'], outer, mids, '<p:bldLst>%s</p:bldLst>' % bld if bld else '')
    tm = etree.fromstring(xml)
    for i, c in enumerate(tm.iter(P + 'cTn'), 1): c.set('id', str(i))   # ascending, document order
    return tm

AR = re.compile(r'[؀-ۿ]')
def fix_fonts(root):
    for p in root.iter('{%s}p' % AN):
        for r in p.iter('{%s}r' % AN):
            t = r.find('{%s}t' % AN); rp = r.find('{%s}rPr' % AN)
            if rp is None: continue
            rar = bool(AR.search(t.text or ''))
            face = '29LT Kaff' if rar else 'Diodrum Arabic'
            rp.set('lang', 'ar-SA' if rar else 'en-US')
            for tag in ('latin', 'ea', 'cs', 'sym'):
                for e in rp.findall('{%s}%s' % (AN, tag)): rp.remove(e)
            for tag in ('latin', 'cs'):
                e = etree.SubElement(rp, '{%s}%s' % (AN, tag)); e.set('typeface', face)

tmp = 'm_tmp'; shutil.rmtree(tmp, ignore_errors=True)
zipfile.ZipFile(src).extractall(tmp)
n_sl = len(glob.glob(tmp + '/ppt/slides/slide*.xml'))
for n in range(1, n_sl + 1):
    f = '%s/ppt/slides/slide%d.xml' % (tmp, n)
    tree = etree.parse(f); root = tree.getroot()
    fix_fonts(root)
    k = 1
    for e in root.iter(P + 'cNvPr'):          # unique shape ids (pptxgenjs can repeat one)
        e.set('id', str(k)); k += 1
    ids = {}; textids = set()
    for sp in root.iter(P + 'sp', P + 'pic', P + 'graphicFrame', P + 'cxnSp'):
        nv = sp.find('.//' + P + 'cNvPr')
        if sp.tag == P + 'sp':
            tx = ''.join(t.text or '' for t in sp.iter('{%s}t' % AN)).strip()
            if tx and nv is not None: ids.setdefault('t:' + tx, int(nv.get('id')))
        if nv is not None and nv.get('name'):
            ids[nv.get('name')] = int(nv.get('id'))
            if sp.tag == P + 'sp' and sp.find('.//{%s}t' % AN) is not None: textids.add(int(nv.get('id')))
    steps = anim.get(str(n), [])
    animated = {e['name'] for st in steps for e in st}
    miss = animated - set(ids)
    if miss: print('slide', n, 'missing', sorted(miss)[:8])
    tr = etree.fromstring('<p:transition xmlns:p="%s" spd="med"><p:fade/></p:transition>' % NS['p'])
    tm = timing(steps, ids, {ids[x] for x in animated if x in ids and ids[x] in textids})
    clr = root.find(P + 'clrMapOvr')
    pos = list(root).index(clr) + 1 if clr is not None else len(root)
    root.insert(pos, tr); root.insert(pos + 1, tm)
    tree.write(f, xml_declaration=True, encoding='UTF-8', standalone=True)

if os.path.exists(dst): os.remove(dst)
z = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
order = ['[Content_Types].xml']
for dp, dn, fn in os.walk(tmp):
    for x in fn:
        rel = os.path.relpath(os.path.join(dp, x), tmp)
        if rel not in order: order.append(rel)
for rel in order: z.write(os.path.join(tmp, rel), rel)
z.close(); print('motion ok', n_sl)
