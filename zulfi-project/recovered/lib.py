"""Builders in the Awj kick-off template language (charcoal, amber, soft grey, Calibri)."""
import re, os, shutil, json, subprocess, glob
from lxml import etree

W = 'w'
NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
P = '{%s}' % NS['p']; A = '{%s}' % NS['a']
E = lambda i: int(round(i * 914400))
DARK, AMBER, CARD, GREY, MID, WHITE = '2B2D31', 'F5A623', 'F3F4F6', '6B7280', 'D1D5DB', 'FFFFFF'
LIGHT_AMBER = 'FDE9C4'
esc = lambda t: t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
ICONS = 'icons'


class Ids:
    def __init__(self, s=6): self.n = s
    def next(self): self.n += 1; return self.n - 1


def run(t, sz, bold=False, color=DARK, italic=False):
    return (f'<a:r><a:rPr lang="en-US" sz="{int(sz*100)}" b="{1 if bold else 0}" i="{1 if italic else 0}" dirty="0"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'
            f'<a:latin typeface="Calibri"/><a:cs typeface="Calibri"/></a:rPr><a:t>{esc(t)}</a:t></a:r>')


def para(t, sz, bold=False, color=DARK, algn='l', bullet=False, after=5, runs=None, line=None):
    ppr = f'<a:pPr marL="{228600 if bullet else 0}" indent="{-228600 if bullet else 0}" algn="{algn}">'
    if line: ppr += f'<a:lnSpc><a:spcPct val="{int(line*1000)}"/></a:lnSpc>'
    ppr += f'<a:spcAft><a:spcPts val="{int(after*100)}"/></a:spcAft>' + (f'<a:buClr><a:srgbClr val="{AMBER}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/>' if bullet else '<a:buNone/>') + '</a:pPr>'
    body = ''.join(run(*r) for r in runs) if runs else run(t, sz, bold, color)
    return f'<a:p>{ppr}{body}</a:p>'


SHADOW = '<a:effectLst><a:outerShdw blurRad="63500" dist="19050" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="16000"/></a:srgbClr></a:outerShdw></a:effectLst>'


def _xf(x, y, w, h, rot=0, flipH=False, flipV=False):
    attrs = (f' rot="{int(rot*60000)}"' if rot else '') + (' flipH="1"' if flipH else '') + (' flipV="1"' if flipV else '')
    return f'<a:xfrm{attrs}><a:off x="{E(x)}" y="{E(y)}"/><a:ext cx="{E(w)}" cy="{E(h)}"/></a:xfrm>'


def textbox(ids, x, y, w, h, paras, anchor='t', name=None, ins=(0.05, 0.03)):
    i = ids.next(); name = esc(name) if name else name
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{i}" name="{name or "TextBox %d" % (i-1)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>{_xf(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'
            f'<p:txBody><a:bodyPr wrap="square" lIns="{E(ins[0])}" tIns="{E(ins[1])}" rIns="{E(ins[0])}" bIns="{E(ins[1])}" anchor="{anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>{"".join(paras)}</p:txBody></p:sp>')


def shape(ids, prst, x, y, w, h, fill, paras=None, adj=None, name=None, shadow=False, line=None, lw=1.0, rot=0, flipH=False, flipV=False, alpha=None, anchor='ctr', adj2=None, dash=None):
    i = ids.next(); name = esc(name) if name else name
    av = '<a:avLst/>'
    if adj is not None:
        n1, n2 = ('adj1', 'adj2') if prst == 'rightArrow' else ('adj', 'adj2')
        av = f'<a:avLst><a:gd name="{n1}" fmla="val {adj}"/>' + (f'<a:gd name="{n2}" fmla="val {adj2}"/>' if adj2 is not None else '') + '</a:avLst>'
    fillx = '<a:noFill/>' if fill is None else (f'<a:solidFill><a:srgbClr val="{fill}">' + (f'<a:alpha val="{int(alpha*1000)}"/>' if alpha else '') + '</a:srgbClr></a:solidFill>')
    ln = '<a:ln><a:noFill/></a:ln>' if not line else f'<a:ln w="{int(lw*12700)}"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill>' + (f'<a:prstDash val="{dash}"/>' if dash else '') + '</a:ln>'
    body = ''.join(paras) if paras else '<a:p><a:pPr algn="ctr"/><a:endParaRPr lang="en-US"/></a:p>'
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{i}" name="{name or "Shape %d" % (i-1)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>{_xf(x, y, w, h, rot, flipH, flipV)}<a:prstGeom prst="{prst}">{av}</a:prstGeom>{fillx}{ln}'
            f'{SHADOW if shadow else "<a:effectLst/>"}</p:spPr><p:txBody><a:bodyPr wrap="square" lIns="{E(0.08)}" rIns="{E(0.08)}" tIns="{E(0.04)}" bIns="{E(0.04)}" rtlCol="0" anchor="{anchor}"/><a:lstStyle/>{body}</p:txBody></p:sp>')


def rrect(ids, x, y, w, h, fill, paras=None, adj=6000, **k): return shape(ids, 'roundRect', x, y, w, h, fill, paras, adj=adj, **k)
def rect(ids, x, y, w, h, fill, paras=None, **k): return shape(ids, 'rect', x, y, w, h, fill, paras, **k)
def oval(ids, x, y, d, fill, paras=None, **k): return shape(ids, 'ellipse', x, y, d, d, fill, paras, **k)


def line(ids, x1, y1, x2, y2, color=GREY, w=1.25, dash=None, name=None, arrow=False):
    i = ids.next(); x, y = min(x1, x2), min(y1, y2); fh = x2 < x1; fv = y2 < y1
    attrs = (' flipH="1"' if fh else '') + (' flipV="1"' if fv else '')
    d = f'<a:prstDash val="{dash}"/>' if dash else ''
    tail = '<a:tailEnd type="triangle" w="med" len="med"/>' if arrow else ''
    return (f'<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="{i}" name="{name or "Straight Connector %d" % (i-1)}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm{attrs}><a:off x="{E(x)}" y="{E(y)}"/><a:ext cx="{E(abs(x2-x1))}" cy="{E(abs(y2-y1))}"/></a:xfrm>'
            f'<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="{int(w*12700)}"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill>{d}{tail}</a:ln></p:spPr></p:cxnSp>')


def group(ids, name, x, y, w, h, children):
    i = ids.next(); name = esc(name)
    return (f'<p:grpSp><p:nvGrpSpPr><p:cNvPr id="{i}" name="{name}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="{E(x)}" y="{E(y)}"/><a:ext cx="{E(w)}" cy="{E(h)}"/>'
            f'<a:chOff x="{E(x)}" y="{E(y)}"/><a:chExt cx="{E(w)}" cy="{E(h)}"/></a:xfrm></p:grpSpPr>{"".join(children)}</p:grpSp>')


def pic(ids, rid, x, y, w, h, name='Picture', descr='', adj=None, line=None, lw=2.0):
    i = ids.next(); name = esc(name)
    geom = f'<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val {adj}"/></a:avLst></a:prstGeom>' if adj else '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
    ln = f'<a:ln w="{int(lw*12700)}"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>' if line else ''
    return (f'<p:pic><p:nvPicPr><p:cNvPr id="{i}" name="{name}" descr="{esc(descr)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
            f'<p:spPr>{_xf(x, y, w, h)}{geom}{ln}</p:spPr></p:pic>')


class Slide:
    def __init__(self, fn):
        self.fn = fn; self.path = f'{W}/ppt/slides/{fn}'; self.ids = Ids(6); self.out = []; self.rels = {}
        self.tree = etree.parse(self.path); root = self.tree.getroot(); self.sp = root.find('.//' + P + 'spTree')
        for k in list(self.sp):
            if k.tag not in (P + 'nvGrpSpPr', P + 'grpSpPr'): self.sp.remove(k)
        for old in root.findall('{http://schemas.openxmlformats.org/markup-compatibility/2006}AlternateContent') + root.findall(P + 'transition') + root.findall(P + 'timing'): root.remove(old)

    def img(self, src, descr=''):
        """register an image (file path) -> rId"""
        base = os.path.basename(src)
        if src.startswith('media:'): target = '../media/' + src[6:]
        else:
            if not os.path.exists(f'{W}/ppt/media/{base}'): shutil.copy(src, f'{W}/ppt/media/{base}')
            target = '../media/' + base
        if target in self.rels: return self.rels[target]
        rp = f'{W}/ppt/slides/_rels/{self.fn}.rels'; r = open(rp, encoding='utf8').read()
        rid = f'rId{100 + len(self.rels)}'
        r = r.replace('</Relationships>', f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="{target}"/></Relationships>')
        open(rp, 'w', encoding='utf8').write(r); self.rels[target] = rid
        return rid

    def add(self, xml): self.out.append(xml)

    def save(self):
        frag = etree.fromstring('<root xmlns:p="%s" xmlns:a="%s" xmlns:r="%s">%s</root>' % (NS['p'], NS['a'], NS['r'], ''.join(self.out)))
        for c in list(frag): self.sp.append(c)
        self.tree.write(self.path, xml_declaration=True, encoding='UTF-8', standalone=True)


def icon_badge(s, x, y, d, name, bg=AMBER, tag='d', shadow=False):
    """circle with icon: bg amber -> dark icon, bg dark -> amber icon, bg white -> dark icon"""
    ids = s.ids
    rid = s.img(f'{ICONS}/{name}_{tag}.png')
    pad = d * 0.24
    return group(ids, 'Icon', x, y, d, d, [oval(ids, x, y, d, bg, name='Badge', shadow=shadow), pic(ids, rid, x + pad, y + pad, d - 2 * pad, d - 2 * pad, name='Icon', descr=name)])


def chip(ids, x, y, w, h, text, fill=AMBER, color=DARK, sz=11, bold=True, name='Chip'):
    return rrect(ids, x, y, w, h, fill, [para(text, sz, bold, color, 'ctr', after=0)], adj=40000, name=name)
