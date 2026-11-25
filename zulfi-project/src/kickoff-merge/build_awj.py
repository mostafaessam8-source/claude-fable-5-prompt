"""Adds four 'Baseline Schedule Overview' slides to the Awj kick-off deck (after slide 7), renumbers sections, page numbers and the agenda."""
import copy, json, re, sys, datetime as dt
from lxml import etree
from pptx import Presentation
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
sys.path.insert(0, '/home/user/claude-fable-5-prompt/zulfi-project/recovered')
import lib
from lib import *     # builders in the Awj template language

SRC = '/home/user/c001/awj/src.pptx'; OUT = '/home/user/c001/awj/Zulfi_Station_Kickoff_Meeting_with_Baseline_Schedule.pptx'
M = json.load(open('/home/user/c001/out/bl02_model.json')); K = {t['code']: t for t in M['tasks']}
MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
def fd(iso): y, m, d = map(int, iso.split('-')); return f'{d} {MN[m - 1]} {str(y)[2:]}'
E = lambda c: fd(K[c]['ef'])
NTP = dt.date(2026, 11, 1)
mo = lambda iso: (dt.date.fromisoformat(iso) - NTP).days / 30.4375
NOTE = 'Months count from the Notice to Proceed, assumed 1 Nov 2026 and not yet confirmed; all dates move with it. Source: baseline programme ZULFI-BL02 (Primavera P6).'
SEC = '03   BASELINE SCHEDULE OVERVIEW'
BDARK = 'B9770E'

prs = Presentation(SRC)
ref = prs.slides[6]                                   # Contractual Requirements: chrome to copy
layout = ref.slide_layout
logo_pic = [sh for sh in ref.shapes if sh.name == 'Logo'][0]
logo_part = ref.part.related_part(logo_pic._element.blipFill.blip.rEmbed) if hasattr(logo_pic._element.blipFill.blip, 'rEmbed') else None
NSMAP = {'p': NS['p'], 'a': NS['a'], 'r': NS['r']}

def chrome(slide, title, page):
    """copy Section, Title, Logo, Footer, Page from the reference slide"""
    tree = slide.shapes._spTree
    # background
    bg = ref._element.cSld.find('{%s}bg' % NS['p'])
    if bg is not None: slide._element.cSld.insert(0, copy.deepcopy(bg))
    for sh in ref.shapes:
        if sh.name not in ('Section', 'Title', 'Logo', 'Footer', 'Page'): continue
        el = copy.deepcopy(sh._element)
        if sh.name == 'Logo':
            rid = slide.part.relate_to(logo_part, RT.IMAGE)
            el.find('.//{%s}blip' % NS['a']).set('{%s}embed' % NS['r'], rid)
        else:
            ts = el.findall('.//{%s}t' % NS['a'])
            new = {'Section': SEC, 'Title': title, 'Page': str(page)}.get(sh.name)
            if new is not None:
                ts[0].text = new
                for extra in ts[1:]: extra.text = ''
        tree.append(el)

def add_xml(slide, xml_list):
    tree = slide.shapes._spTree
    frag = etree.fromstring('<root xmlns:p="%s" xmlns:a="%s" xmlns:r="%s">%s</root>' % (NS['p'], NS['a'], NS['r'], ''.join(xml_list)))
    for c in list(frag): tree.append(c)

def timing_xml(units):
    """units: list of (group shape id, effect) ; one build step per unit, ascending cTn ids"""
    ctr = [2]
    def nid(): ctr[0] += 1; return ctr[0]
    body = ''; t = 0
    for sid, fx in units:
        pid, sub, flt = (22, 8, 'wipe(left)') if fx == 'wipe' else (10, 0, 'fade')
        c, st, a = nid(), nid(), nid()
        eff = ('<p:par><p:cTn id="%d" presetID="%d" presetClass="entr" presetSubtype="%d" fill="hold" nodeType="afterEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
               '<p:set><p:cBhvr><p:cTn id="%d" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="%d"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>'
               '<p:animEffect transition="in" filter="%s"><p:cBhvr><p:cTn id="%d" dur="500"/><p:tgtEl><p:spTgt spid="%d"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>') % (c, pid, sub, st, sid, flt, a, sid)
        body += '<p:par><p:cTn id="%d" fill="hold"><p:stCondLst><p:cond delay="%d"/></p:stCondLst><p:childTnLst>%s</p:childTnLst></p:cTn></p:par>' % (nid(), t, eff)
        t += 380
    outer = nid()
    xml = ('<p:timing xmlns:p="%s"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
           '<p:par><p:cTn id="%d" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>%s</p:childTnLst></p:cTn></p:par>'
           '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>') % (NS['p'], outer, body)
    tm = etree.fromstring(xml)
    for i, c in enumerate(tm.iter('{%s}cTn' % NS['p']), 1): c.set('id', str(i))     # ascending in document order
    return tm

def finish(slide, units, notes):
    el = slide._element
    clr = el.find('{%s}clrMapOvr' % NS['p'])
    tr = etree.fromstring('<p:transition xmlns:p="%s" spd="med"><p:fade/></p:transition>' % NS['p'])
    pos = list(el).index(clr) + 1
    el.insert(pos, tr); el.insert(pos + 1, timing_xml(units))
    ns = slide.notes_slide
    if ns.notes_text_frame is None:                       # this deck's notes master has no body placeholder: copy the structure of an existing notes slide
        src_tree = ref.notes_slide.shapes._spTree
        dst_tree = ns.shapes._spTree
        for ch in list(dst_tree)[2:]: dst_tree.remove(ch)
        for ch in list(src_tree)[2:]: dst_tree.append(copy.deepcopy(ch))
    tf = ns.notes_text_frame
    tf.text = notes

def new_slide(title, page):
    s = prs.slides.add_slide(layout)
    for sh in list(s.shapes): sh._element.getparent().remove(sh._element)
    chrome(s, title, page)
    return s

class Ctx:
    def __init__(self): self.ids = Ids(30); self.units = []
    def unit(self, name, x, y, w, h, children, fx='fade'):
        gid = self.ids.n; xml = group(self.ids, name, x, y, w, h, children)     # group() takes its id after the children are built
        return xml, fx
def make_group(ctx, name, x, y, w, h, children_fn, fx='fade'):
    """children are built first with fresh ids; the group id is taken afterwards, so read it back from the XML"""
    kids = children_fn()
    xml = group(ctx.ids, name, x, y, w, h, kids)
    gid = int(re.search(r'<p:cNvPr id="(\d+)"', xml).group(1))
    ctx.units.append((gid, fx)); return xml

def note_text(ctx, text, y=6.66):
    return textbox(ctx.ids, 0.6, y, 12.15, 0.3, [para(text, 9.5, False, GREY, after=0)], name='Note')
def card(ids, x, y, w, h, fill=CARD, name='Card', **k): return rrect(ids, x, y, w, h, fill, adj=7000, name=name, shadow=True, **k)

# page numbers: new slides occupy pages 8 to 11
# ================================================= 1. OVERVIEW
s1 = new_slide('Baseline Schedule Overview', 8); c = Ctx(); xml = []
kp = [('26 months', 'Contract duration from the Notice to Proceed', DARK), ('31 Dec 2028', 'Contract completion, zero total float', AMBER), ('20 Dec 2028', 'Taking-Over of all works', DARK), ('597 activities', '1,086 logic links, Primavera P6', DARK)]
for i, (v, l, col) in enumerate(kp):
    x = 0.6 + i * 3.08
    xml.append(make_group(c, f'KPI {i + 1}', x, 1.5, 2.9, 0.95, lambda x=x, v=v, l=l, col=col: [card(c.ids, x, 1.5, 2.9, 0.95), textbox(c.ids, x + 0.18, 1.55, 2.6, 0.5, [para(v, 22, True, col, after=0)], anchor='ctr'), textbox(c.ids, x + 0.18, 2.03, 2.6, 0.38, [para(l, 10.5, False, GREY, after=0)])], 'wipe'))
lx, lw, x0, x1 = 0.6, 2.55, 3.25, 12.75; W = (x1 - x0) / 26; y0 = 2.65; rh = 0.33
def ruler():
    ch = [rect(c.ids, x0, y0, x1 - x0, 0.28, MID, name='Ruler'), textbox(c.ids, lx, y0, lw, 0.28, [para('Month from NTP', 10.5, True, AMBER, after=0)], anchor='ctr')]
    for m in range(1, 27): ch.append(textbox(c.ids, x0 + (m - 1) * W, y0, W, 0.28, [para(str(m), 8.5, False, DARK, 'ctr', after=0)], anchor='ctr', ins=(0, 0)))
    return ch
xml.append(make_group(c, 'Month ruler', lx, y0, x1 - lx, 0.28, ruler, 'wipe'))
rows = [('Mobilisation and preliminaries', 1, 2, GREY, True), ('Design (3 SAR gates)', 2, 11, DARK, True), ('TGA, permits, approvals', 1, 12, AMBER, True), ('Phase 1 procurement (12 items)', 7, 18, GREY, False), ('Phase 2 procurement (4 items)', 11, 22, GREY, False),
        ('Phase 1 construction', 12, 20, AMBER, False), ('Phase 2 construction', 12, 24, AMBER, False), ('Phase 1 testing and commissioning', 14, 26, LIGHT_AMBER, False), ('Phase 2 testing and commissioning', 18, 25, LIGHT_AMBER, False), ('Taking-Over and close-out', 26, 26, DARK, True)]
for i, (lab, a, b, col, bold) in enumerate(rows):
    y = y0 + 0.34 + i * rh
    def kids(i=i, lab=lab, a=a, b=b, col=col, bold=bold, y=y):
        k = []
        if i % 2 == 0: k.append(rect(c.ids, lx, y, x1 - lx, rh, CARD, name='Row'))
        k.append(textbox(c.ids, lx + 0.08, y, lw + 0.4, rh, [para(lab, 10.5, bold, DARK, after=0)], anchor='ctr'))
        k.append(rect(c.ids, x0 + (a - 1) * W, y + 0.06, (b - a + 1) * W, rh - 0.12, col, name='Bar'))
        return k
    xml.append(make_group(c, f'Row {i + 1}', lx, y, x1 - lx, rh, kids, 'wipe'))
gy = y0 + 0.34; gh = len(rows) * rh
def gates():
    k = []
    for g, m in (('Gate 1', 3), ('Gate 2', 6), ('Gate 3', 11)):
        k.append(line(c.ids, x0 + m * W, gy, x0 + m * W, gy + gh, GREY, 1, 'dash', name=g + ' line'))
        k.append(textbox(c.ids, x0 + m * W - 0.4, gy + gh + 0.03, 0.8, 0.24, [para(g, 9.5, True, DARK, 'ctr', after=0)], ins=(0, 0)))
    return k
xml.append(make_group(c, 'Gates', x0, gy, x1 - x0, gh + 0.3, gates, 'wipe'))
xml.append(note_text(c, NOTE, 6.72))
add_xml(s1, xml)
finish(s1, c.units, 'General overview of the baseline schedule: 26 months, two phases, one design stage with three SAR gates, procurement from Month 7 (Phase 1) and Month 11 (Phase 2), construction from Month 12 and Taking-Over in Month 26. Dates are indicative until the Notice to Proceed date is confirmed.')

# ================================================= 2. MILESTONES
s2 = new_slide('Baseline Milestones', 9); c = Ctx(); xml = []
ms = [('MS-0010', 'Notice to Proceed (assumed)', '1 Nov 26', 1), ('MS-0030', 'Gate 1: Concept design approved', E('MS-0030'), None), ('MS-0040', 'Gate 2: Preliminary design approved', E('MS-0040'), None), ('MS-0050', 'Phase 1 procurement start', E('MS-0050'), None),
      ('MS-0075', 'Environmental permit and authority approvals obtained', E('MS-0075'), None), ('MS-0060', 'Gate 3: Detailed design (IFC) approved', E('MS-0060'), None), ('MS-0080', 'Phase 2 procurement start', E('MS-0080'), None), ('MS-0070', 'SAR work permit issued', E('MS-0070'), None),
      ('MS-0090', 'Construction start', E('MS-0090'), None), ('MS-0100', 'Signalling and turnout materials delivered', E('MS-0100'), None), ('MS-0110', 'Track materials delivered', E('MS-0110'), None), ('MS-0120', 'All construction works complete', E('MS-0120'), None),
      ('MS-0130', 'Taking-Over of all works', E('MS-0130'), None), ('MS-0140', 'Contract completion', E('MS-0140'), None)]
half = 7
for ci, col in enumerate((ms[:half], ms[half:])):
    for i, m in enumerate(col):
        x = 0.6 + ci * 6.2; y = 1.5 + i * 0.74
        mm = m[3] or (int(mo(K[m[0]]['ef'])) + 1); hot = m[0] in ('MS-0130', 'MS-0140')
        xml.append(make_group(c, f'Milestone {ci * half + i + 1}', x, y, 5.95, 0.64, lambda x=x, y=y, m=m, mm=mm, hot=hot: [
            card(c.ids, x, y, 5.95, 0.64), oval(c.ids, x + 0.2, y + 0.2, 0.24, AMBER if hot else DARK, name='Dot'),
            textbox(c.ids, x + 0.6, y, 3.5, 0.64, [para(m[1], 12, True, DARK, after=0)], anchor='ctr'),
            textbox(c.ids, x + 4.05, y, 0.9, 0.64, [para(f'Month {mm}', 10.5, False, GREY, after=0)], anchor='ctr'),
            textbox(c.ids, x + 4.9, y, 0.95, 0.64, [para(m[2], 12, True, BDARK if hot else DARK, 'r', after=0)], anchor='ctr')], 'wipe'))
xml.append(note_text(c, NOTE, 6.72)); add_xml(s2, xml)
finish(s2, c.units, 'Fourteen contract and programme milestones. Gate dates are the SAR approval dates in the design chain; the work permit is issued 14 days after Gate 3.')

# ================================================= 3. DESIGN, SUBMITTALS, APPROVALS
s3 = new_slide('Design, Submittals and Approvals', 10); c = Ctx(); xml = []
cols = [('Design stages and gates', [f'Concept: develop 24 to 40 d, submit 3 d, SAR review 14 d. Gate 1 {E("DS-0020")}', f'Preliminary: develop 36 to 57 d, submit 3 d, SAR review 21 d. Gate 2 {E("DS-0360")}', f'Detailed and IFC: develop up to 109 d, submit 3 d, SAR review 28 d. Gate 3 {E("DS-0700")}', '16 design packages run in parallel through the three gates']),
        ('Submittals and reviews', ['Every submission is its own activity (Awj); every review or approval is its own activity (SAR or authority)', 'Material submittal 3 d, SAR approval 28 d, then purchase order 10 d', 'Inspection and possession requests are submitted before SAR or the authority reviews them']),
        ('Permits and TGA', [f'SAR work permit: package {fd(K["TG-0610"]["es"])}, issued {E("PR-0120")}', f'Environmental permit (GAMEP): approved {E("PR-2270")}', 'HCIS and Civil Defense design approvals before Gate 3', f'Independent Competent Person accepted {E("TG-2020")}; safety case reviewed {E("TG-2220")}', 'TGA, ICP and HCIS review times to be confirmed'])]
for i, (h, items) in enumerate(cols):
    x = 0.6 + i * 4.1
    xml.append(make_group(c, f'Column {i + 1}', x, 1.5, 3.95, 5.0, lambda x=x, h=h, items=items: [
        card(c.ids, x, 1.5, 3.95, 5.0), rect(c.ids, x, 1.5, 3.95, 0.08, AMBER, name='Accent'),
        textbox(c.ids, x + 0.2, 1.7, 3.55, 0.42, [para(h, 15, True, DARK, after=0)], anchor='ctr'),
        textbox(c.ids, x + 0.2, 2.3, 3.55, 4.1, [para(t, 12, False, DARK, bullet=True, after=9) for t in items])], 'wipe'))
xml.append(note_text(c, NOTE, 6.72)); add_xml(s3, xml)
finish(s3, c.units, 'Design review windows of 14, 21 and 28 days are baseline assumptions for SAR to confirm. The work permit chain follows the SAR Work Permit Handbook V2.')

# ================================================= 4. CRITICAL PATH, LONG-LEAD, BASIS
s4 = new_slide('Critical Path, Long-Lead Items and Basis', 11); c = Ctx(); xml = []
xml.append(make_group(c, 'Critical path heading', 0.6, 1.45, 12.15, 0.36, lambda: [textbox(c.ids, 0.6, 1.45, 12.15, 0.36, [para('Critical path: 35 activities, zero float, ending at Taking-Over and completion', 13.5, True, DARK, after=0)], anchor='ctr')]))
nodes = [('Gate 3', E('DS-0700')), ('Track material approved', E('PC-2310')), ('Track order placed', E('PC-0470')), ('Manufacture 245 d', E('PC-0660')), ('Delivered to site', E('PC-0670')), ('Track installed', E('CN-1660')), ('Trial running', E('TC-0460')), ('Safety assessment', E('TC-0380')), ('Taking-Over', E('CO-0015'))]
w = 1.27; g = 0.09
for i, (t, d) in enumerate(nodes):
    x = 0.6 + i * (w + g)
    xml.append(make_group(c, f'Node {i + 1}', x, 1.9, w, 1.0, lambda x=x, t=t, d=d, i=i: [card(c.ids, x, 1.9, w, 1.0, LIGHT_AMBER if i == 3 else CARD),
        textbox(c.ids, x + 0.05, 1.93, w - 0.1, 0.55, [para(t, 10.5, True, DARK, 'ctr', after=0)], anchor='ctr', ins=(0.02, 0.02)), textbox(c.ids, x + 0.05, 2.48, w - 0.1, 0.38, [para(d, 11, True, BDARK, 'ctr', after=0)], anchor='ctr', ins=(0.02, 0.02))], 'wipe'))
xml.append(make_group(c, 'Long-lead heading', 0.6, 3.12, 6.0, 0.34, lambda: [textbox(c.ids, 0.6, 3.12, 6.0, 0.34, [para('Long-lead items', 13.5, True, DARK, after=0)], anchor='ctr')]))
lp = [('Railway Track (Phase 2)', '245 d', K['PC-0660']['tf'], 'PC-0670'), ('Signalling and Telecom', '245 d', K['PC-0640']['tf'], 'MS-0100'), ('Railway Turnouts', '245 d', K['PC-0680']['tf'], 'MS-0100'), ('Substation and SEC', '180 d', K['PC-0600']['tf'], 'PC-0610'), ('Generator room (Phase 2)', '150 d', K['PC-0620']['tf'], 'PC-0630')]
def lphead(): return [textbox(c.ids, 0.7, 3.5, 2.3, 0.26, [para('Package', 10, True, GREY, after=0)]), textbox(c.ids, 3.0, 3.5, 1.1, 0.26, [para('Manufacture', 10, True, GREY, after=0)]), textbox(c.ids, 4.15, 3.5, 1.2, 0.26, [para('Delivered', 10, True, GREY, after=0)]), textbox(c.ids, 5.45, 3.5, 1.0, 0.26, [para('Float', 10, True, GREY, after=0)])]
xml.append(make_group(c, 'Long-lead columns', 0.6, 3.5, 6.0, 0.26, lphead))
for i, (n, mf, tf, dc) in enumerate(lp):
    y = 3.8 + i * 0.5; crit = tf == 0
    xml.append(make_group(c, f'Long-lead {i + 1}', 0.6, y, 6.0, 0.42, lambda y=y, n=n, mf=mf, tf=tf, dc=dc, crit=crit: [card(c.ids, 0.6, y, 6.0, 0.42, LIGHT_AMBER if crit else CARD),
        textbox(c.ids, 0.7, y, 2.3, 0.42, [para(n, 11.5, True, DARK, after=0)], anchor='ctr'), textbox(c.ids, 3.0, y, 1.1, 0.42, [para(mf, 11.5, False, DARK, after=0)], anchor='ctr'),
        textbox(c.ids, 4.15, y, 1.2, 0.42, [para(E(dc), 11.5, False, DARK, after=0)], anchor='ctr'), textbox(c.ids, 5.45, y, 1.0, 0.42, [para(f'{tf} d', 11.5, True, BDARK if crit else DARK, after=0)], anchor='ctr')], 'wipe'))
basis = ['Primavera P6 programme, 597 activities, 3 calendars: SAR 7-day for design and procurement, 6-day for construction (Friday off), calendar days for manufacture and shipping', 'Notice to Proceed assumed 1 Nov 2026 (not confirmed); all dates move with it', 'SAR review windows 14, 21 and 28 days for design; 28 days for material approval', 'Phase 1: 12 items, procurement from Month 7. Phase 2: 4 items, procurement from Month 11', 'No negative float: the programme finishes on 31 Dec 2028 with zero float']
xml.append(make_group(c, 'Baseline basis', 6.85, 3.12, 5.9, 3.4, lambda: [card(c.ids, 6.85, 3.12, 5.9, 3.4), rect(c.ids, 6.85, 3.12, 5.9, 0.08, AMBER, name='Accent'), textbox(c.ids, 7.05, 3.3, 5.5, 0.38, [para('Baseline basis', 14, True, DARK, after=0)], anchor='ctr'),
    textbox(c.ids, 7.05, 3.78, 5.5, 2.7, [para(t, 11, False, DARK, bullet=True, after=6) for t in basis])], 'wipe'))
xml.append(note_text(c, NOTE, 6.72)); add_xml(s4, xml)
finish(s4, c.units, 'The railway track chain is the only chain with no float: from Gate 3 through procurement, 245 days of manufacture, installation, testing, the SAR safety assessment and the Taking-Over certificate.')

# ---------------------------------------------------------------- reorder: new slides after slide 7
lst = prs.slides._sldIdLst; ids = list(lst)
new = ids[-4:]
for el in new: lst.remove(el)
for k, el in enumerate(new): lst.insert(7 + k, el)

# ---------------------------------------------------------------- renumber the later slides (section labels and page numbers)
def settext(shape, fn):
    for p in shape.text_frame.paragraphs:
        for r in p.runs:
            r.text = fn(r.text)
sec_map = {'03   ORGANIZATION & ROLES': '04   ORGANIZATION & ROLES', '04   EXECUTION, MOBILIZATION & ENGINEERING': '05   EXECUTION, MOBILIZATION & ENGINEERING', '05   PROCUREMENT, SUBMITTALS & QA/QC': '06   PROCUREMENT, SUBMITTALS & QA/QC',
           '06   HSE, RISK & COMMUNICATION': '07   HSE, RISK & COMMUNICATION', '07   CONTROL, ACTIONS & NEXT STEPS': '08   CONTROL, ACTIONS & NEXT STEPS'}
for idx, s in enumerate(prs.slides, 1):
    if idx <= 11 and idx not in range(8, 12): pass
    for sh in s.shapes:
        if sh.name == 'Section' and sh.has_text_frame and idx >= 12: settext(sh, lambda t: sec_map.get(t, t))
        if sh.name == 'Page' and sh.has_text_frame and idx >= 12: settext(sh, lambda t: str(int(t) + 4) if t.strip().isdigit() else t)
# check the page numbers of every slide
for idx, s in enumerate(prs.slides, 1):
    pg = [sh.text_frame.text for sh in s.shapes if sh.name == 'Page']
    if pg and pg[0].strip() != str(idx): print('page mismatch', idx, pg)

# ---------------------------------------------------------------- agenda (slide 2): insert an item after "Project, Scope & Contract" and re-space the eight cards
ag = prs.slides[1]
groups = [sh for sh in ag.shapes if sh.name.startswith('Agenda ')]
groups.sort(key=lambda g: g.top)
labels = ['Welcome & Objectives', 'Project, Scope & Contract', 'Baseline Schedule Overview', 'Organization & Roles', 'Execution, Mobilization & Engineering', 'Procurement, Submittals & QA/QC', 'HSE, Risk & Communication', 'Control, Actions & Next Steps & Q.A']
chips = ['Slide 3', 'Slides 4-7', 'Slides 8-11', 'Slides 12-13', 'Slides 14-16', 'Slides 17-19', 'Slides 20-22', 'Slides 23-24']
# duplicate the third group for the new item
tree = ag.shapes._spTree
new_g = copy.deepcopy(groups[2]._element); groups[2]._element.addnext(new_g)
# unique ids for the copy
mx = max(int(e.get('id')) for e in tree.iter('{%s}cNvPr' % NS['p'])) + 1
for e in new_g.iter('{%s}cNvPr' % NS['p']): e.set('id', str(mx)); mx += 1
groups = [sh for sh in ag.shapes if sh.name.startswith('Agenda ')]
# keep document order = visual order
order = list(tree)
ordered = []
for el in order:
    for g in groups:
        if g._element is el: ordered.append(g)
step, h = 0.645, 0.56
EMU = 914400
for i, g in enumerate(ordered):
    y = 1.5 + i * step
    parts = {sh.name: sh for sh in g.shapes}
    g.name = f'Agenda {i + 1}'
    card_ = parts['Card']; card_.top = int(y * EMU); card_.height = int(h * EMU)
    num = [sh for sh in g.shapes if sh.name == 'Number'][0]; num.top = int((y + 0.07) * EMU); num.height = num.width = int(0.42 * EMU); num.text_frame.paragraphs[0].runs[0].text = str(i + 1)
    tb = [sh for sh in g.shapes if sh.shape_type == 17][0]; tb.top = int(y * EMU); tb.height = int(h * EMU); tb.text_frame.paragraphs[0].runs[0].text = labels[i]
    ch = [sh for sh in g.shapes if sh.name == 'Chip'][0]; ch.top = int((y + 0.12) * EMU); ch.height = int(0.32 * EMU); ch.text_frame.paragraphs[0].runs[0].text = chips[i]
    # group frame to match children
    xfrm = g._element.grpSpPr.find('{%s}xfrm' % NS['a'])
    xfrm.find('{%s}off' % NS['a']).set('y', str(int(y * EMU))); xfrm.find('{%s}chOff' % NS['a']).set('y', str(int(y * EMU)))
    xfrm.find('{%s}ext' % NS['a']).set('cy', str(int(h * EMU))); xfrm.find('{%s}chExt' % NS['a']).set('cy', str(int(h * EMU)))
prs.save(OUT); print('saved', OUT, len(prs.slides), 'slides')
