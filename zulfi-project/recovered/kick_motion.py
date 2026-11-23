"""Unified slide transition (Morph, fade fallback) and inner animation for every slide of the kick-off deck."""
import re, json, glob, sys
from lxml import etree

W = 'w'
NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
P = '{%s}' % NS['p']; A = '{%s}' % NS['a']
EMU = 914400
order = json.load(open('order.json'))
_id = [2]
nid = lambda: (_id.__setitem__(0, _id[0] + 1), _id[0])[1]
tgt = lambda spid: '<p:tgtEl><p:spTgt spid="%d"/></p:tgtEl>' % spid
FX = {'fade': (10, 0), 'wipe': (22, 8)}


def effect(spid, fx, node, dur=500):
    pid, sub = FX[fx]
    c, st = nid(), nid()
    body = ('<p:set><p:cBhvr><p:cTn id="%d" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>%s<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>' % (st, tgt(spid)))
    flt = 'fade' if fx == 'fade' else 'wipe(left)'
    body += '<p:animEffect transition="in" filter="%s"><p:cBhvr><p:cTn id="%d" dur="%d"/>%s</p:cBhvr></p:animEffect>' % (flt, nid(), dur, tgt(spid))
    return ('<p:par><p:cTn id="%d" presetID="%d" presetClass="entr" presetSubtype="%d" fill="hold" grpId="0" nodeType="%s"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>%s</p:childTnLst></p:cTn></p:par>'
            % (c, pid, sub, node, body))


def timing(steps, textids):
    _id[0] = 2
    mids = ''; t = 0
    n = max(len(steps), 1)
    gap = max(150, min(420, int(4200 / n)))
    for st in steps:
        eff = ''.join(effect(spid, fx, 'afterEffect' if k == 0 else 'withEffect') for k, (spid, fx) in enumerate(st))
        mids += '<p:par><p:cTn id="%d" fill="hold"><p:stCondLst><p:cond delay="%d"/></p:stCondLst><p:childTnLst>%s</p:childTnLst></p:cTn></p:par>' % (nid(), t, eff)
        t += gap
    outer = nid()
    bld = ''.join('<p:bldP spid="%d" grpId="0" animBg="1"/>' % i for i in sorted(textids))
    xml = ('<p:timing xmlns:p="%s"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
           '<p:par><p:cTn id="%d" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>%s</p:childTnLst></p:cTn></p:par>'
           '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
           '</p:childTnLst></p:cTn></p:par></p:tnLst>%s</p:timing>') % (NS['p'], outer, mids, '<p:bldLst>%s</p:bldLst>' % bld if bld else '')
    return etree.fromstring(xml)


TRANS = ('<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:p="%s" xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main">'
         '<mc:Choice Requires="p159"><p:transition spd="slow" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" p14:dur="1500"><p159:morph option="byObject"/></p:transition></mc:Choice>'
         '<mc:Fallback xmlns=""><p:transition spd="med"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>') % NS['p']


def geom(el):
    xf = el.find('.//' + A + 'xfrm')
    if xf is None: xf = el.find('.//' + P + 'xfrm')
    if xf is None: return (0, 0, 0, 0)
    off = xf.find(A + 'off'); ext = xf.find(A + 'ext')
    if off is None or ext is None: return (0, 0, 0, 0)
    return (int(off.get('x')) / EMU, int(off.get('y')) / EMU, int(ext.get('cx')) / EMU, int(ext.get('cy')) / EMU)


def has_text(el): return any((t.text or '').strip() for t in el.iter(A + 't'))


def classify(el, name, g, is_edge):
    """return None for static, else the effect"""
    x, y, w, h = g
    tag = el.tag
    if tag == P + 'pic': return None if w < 2.2 else 'fade'
    if y > 6.9: return None                                      # footer + page number
    if is_edge and (name.startswith('Right Triangle') or (tag == P + 'grpSp' and y < 1.5 and w < 3.0)): return None
    if tag == P + 'sp' and y < 0.5 and w > 9 and x < 1: return None   # slide title
    if tag == P + 'grpSp' or (tag == P + 'sp' and not el.find('.//' + P + 'cNvSpPr').get('txBox') and 'Oval' not in name and w > 0.9): return 'wipe'
    if tag == P + 'graphicFrame': return 'wipe'
    return 'fade'


def main():
    report = {}
    for pos, tgt_path in enumerate(order, 1):
        path = f'{W}/ppt/{tgt_path}'
        tree = etree.parse(path); root = tree.getroot()
        for old in root.findall('{http://schemas.openxmlformats.org/markup-compatibility/2006}AlternateContent') + root.findall(P + 'transition') + root.findall(P + 'timing'):
            root.remove(old)
        sp = root.find('.//' + P + 'spTree')
        is_edge = tgt_path.endswith(('slide1.xml', 'slide19.xml'))
        items = []
        for el in sp:
            if el.tag not in (P + 'sp', P + 'pic', P + 'grpSp', P + 'graphicFrame', P + 'cxnSp'): continue
            nv = el.find('.//' + P + 'cNvPr'); name = nv.get('name') or ''; spid = int(nv.get('id'))
            g = geom(el)
            fx = 'fade' if el.tag == P + 'cxnSp' else classify(el, name, g, is_edge)
            if fx: items.append((spid, fx, el.tag, g, name, has_text(el)))
        steps = []
        if tgt_path.endswith('slide7.xml'):          # organisation chart: row by row, connectors with the row below them
            thr = [1.5, 3.2, 5.0, 6.0]
            row = lambda y: sum(1 for t in thr if y >= t - 0.05)
            rows = {}
            for it in items:
                y = it[3][1] if it[2] != P + 'cxnSp' else it[3][1] + it[3][3]
                rows.setdefault(row(y), []).append(it)
            for r in sorted(rows):
                boxes = [i for i in rows[r] if i[2] != P + 'cxnSp']; lines = [i for i in rows[r] if i[2] == P + 'cxnSp']
                steps.append([(i[0], 'fade') for i in lines + boxes])
        else:
            for it in items:
                if it[2] == P + 'cxnSp' and steps: steps[-1].append((it[0], 'fade'))
                else: steps.append([(it[0], it[1])])
        tm = timing(steps, {i[0] for i in items if i[2] == P + 'sp' and i[5]})
        clr = root.find(P + 'clrMapOvr')
        idx = list(root).index(clr) + 1
        root.insert(idx, etree.fromstring(TRANS)); root.insert(idx + 1, tm)
        tree.write(path, xml_declaration=True, encoding='UTF-8', standalone=True)
        report[pos] = [(it[4][:18]) for it in items]
    for k, v in report.items(): print(k, len(v), v[:14])


main()
