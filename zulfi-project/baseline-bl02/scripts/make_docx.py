import json, datetime as dt
from docx import Document
from docx.shared import Pt, Inches, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_ORIENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import bl02_spec as S

M = json.load(open('/home/user/c001/out/bl02_model.json'))
T = {t['code']: t for t in M['tasks']}
TEAL = RGBColor(0x00, 0x77, 0x8B); DARK = RGBColor(0x3D, 0x39, 0x35)
d = lambda s: dt.date.fromisoformat(s).strftime('%d-%b-%y')

doc = Document()
sec = doc.sections[0]; sec.page_width, sec.page_height = Cm(21), Cm(29.7)
for a in ('left_margin', 'right_margin'): setattr(sec, a, Cm(2))
sec.top_margin = Cm(2); sec.bottom_margin = Cm(2)
st = doc.styles['Normal']; st.font.name = 'Calibri'; st.font.size = Pt(10.5)
st.element.rPr.rFonts.set(qn('w:eastAsia'), 'Calibri')
for n, sz in (('Heading 1', 16), ('Heading 2', 13)):
    h = doc.styles[n]; h.font.name = 'Calibri'; h.font.size = Pt(sz); h.font.bold = True; h.font.color.rgb = TEAL
    h.element.rPr.rFonts.set(qn('w:eastAsia'), 'Calibri')

def shade(cell, color):
    tcPr = cell._tc.get_or_add_tcPr(); sh = OxmlElement('w:shd'); sh.set(qn('w:val'), 'clear'); sh.set(qn('w:color'), 'auto'); sh.set(qn('w:fill'), color); tcPr.append(sh)
def table(headers, rows, widths, fs=9):
    t = doc.add_table(rows=1, cols=len(headers)); t.style = 'Table Grid'
    for i, h in enumerate(headers):
        c = t.rows[0].cells[i]; c.text = ''; r = c.paragraphs[0].add_run(h); r.bold = True; r.font.size = Pt(fs); r.font.color.rgb = RGBColor(255, 255, 255); shade(c, '00778B')
    for k, row in enumerate(rows):
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = ''; r = cells[i].paragraphs[0].add_run(str(v)); r.font.size = Pt(fs)
            if k % 2: shade(cells[i], 'F2F8F9')
    t.autofit = False
    for i, w in enumerate(widths): t.columns[i].width = Cm(w)
    for row in t.rows:
        for i, w in enumerate(widths): row.cells[i].width = Cm(w)
    doc.add_paragraph()
    return t
def para(text, bold=False, italic=False, size=None):
    p = doc.add_paragraph(); r = p.add_run(text); r.bold = bold; r.italic = italic
    if size: r.font.size = Pt(size)
    return p
def bullets(items):
    for it in items: doc.add_paragraph(it, style='List Bullet')

# ---------------------------------------------------------------- cover
p = doc.add_paragraph(); r = p.add_run('Zulfi Passenger Railway Station'); r.font.size = Pt(24); r.bold = True; r.font.color.rgb = TEAL
p = doc.add_paragraph(); r = p.add_run('Baseline Programme Submittal, Revision 01 (ZULFI-BL02)'); r.font.size = Pt(16); r.font.color.rgb = DARK
para('TGA process, SAR work permit and authority approvals added as linked activities, with the critical path', italic=True)
table(['Item', 'Detail'], [
    ['Contract', 'EPC design and build, SAR 99,999,000 excl. VAT, 26 months from Notice to Proceed'],
    ['Notice to Proceed', 'Assumed 1 Nov 2026; not confirmed. Every date moves with the NTP'],
    ['Contract completion', '31 Dec 2028, zero float; Taking-Over 20 Dec 2028'],
    ['Programme file', 'Zulfi_Baseline_Programme_BL02_TGA.xer (Primavera P6, XER 15.1)'],
    ['Activities and logic', f"{len(T)} activities, {M['rel_count']} relationships, 52 new activities"],
    ['Status', 'For SAR review. TGA, HCIS and work-permit review times are proposals until confirmed'],
], [4.5, 12.5])

doc.add_heading('1. Contents of this submission', 1)
table(['File', 'Content'], [
    ['Zulfi_Baseline_Programme_BL02_TGA.xer', 'The programme for import into P6. New WBS 09 and 3 new activity codes'],
    ['Zulfi_BL02_TGA_Logic_and_Critical_Path.xlsx', 'New activities, logic links, submit-review pairs, critical path, near-critical items, approvals timeline, checks'],
    ['Zulfi_BL02_Critical_Path_and_TGA_Gantt.pdf', 'Critical path chart and TGA process chart (PNG versions included)'],
    ['This report (docx)', 'Method, logic, critical path narrative, phase values, revision log, assumptions and open points'],
    ['ZULFI-BOQ_Corrected.xlsx', 'BOQ and activity cost mapping with the phase reconciliation'],
    ['Zulfi_Programme_Discussion_EN.pptx', '10-slide discussion deck for senior management'],
], [7.5, 9.5])

doc.add_heading('2. What this revision adds', 1)
bullets([
    'A new WBS branch 09 "TGA Compliance, Safety Assurance and SAR Permits" with six groups: ICP and safety planning, design safety assurance, authority design approvals, SAR work permit and possession, construction safety assurance, verification and readiness.',
    'Contract clause 18 is turned into activities: the Independent Competent Person (ICP), Management and Control of Change (inside the DEMP), Safe Design and Construction (hazard identification, safety case, ALARP close-out, ICP verification), and the environmental permit chain (high-level EIA, detailed EIA, GAMEP permit).',
    'The SAR Work Permit Handbook (V2, 20 Jan 2026) is modelled step by step: package preparation, submission by SAR as project owner, 5-working-day acceptance check, 7-day additional documents, cross-functional technical review, delivery plan (TTF02) submission and approval, then issue.',
    'Possession requests for the loop line and turnout tie-ins now have a request package before the SAR booking.',
    'Inspection requests (Civil Defense, SEC, NWC, authorities) and the Taking-Over certificate application are now separate submissions.',
    'The operating-rules change path (SAR-012-200-02-001: 15 + 15 days) is linked to trial running.',
    'Three new activity codes for filtering in P6: TGA Process, Submit / Review, Duration Basis. The Responsibility code gains ICP.',
])

doc.add_heading('3. Submission and review are separate activities', 1)
para('Every new submission is one activity owned by the contractor and every review or approval is its own activity owned by SAR or the authority, following the baseline convention (submission xx-0nnn, review xx-2nnn). The Submit / Review code lets the schedule be filtered on either side.')
counts = {}
for c in M['new']: counts[T[c]['sr']] = counts.get(T[c]['sr'], 0) + 1
para(f"New activities by type: {counts.get('Preparation', 0)} preparation, {counts.get('Submission', 0)} submission, {counts.get('Review / Approval', 0)} review or approval, {counts.get('Not applicable', 0)} other (ICP checks, hazard work, witness).")
doc.add_heading('Existing activities renamed for clarity', 2)
table(['ID', 'New name'], [[k, v] for k, v in S.RENAME.items()], [2.5, 14.5])
para('Existing activities that were split: the SAR work permit (now a 7-activity chain before the final approval), the possession bookings, the safety assessment, the Taking-Over certificate, and the authority inspections.', size=10)

doc.add_heading('4. SAR work permit chain', 1)
chain = ['TG-0610', 'TG-0620', 'TG-2620', 'TG-0630', 'TG-2630', 'TG-0640', 'TG-2640', 'DS-0700', 'PR-0120', 'MS-0070', 'MS-0090']
table(['ID', 'Activity', 'Days', 'By', 'Start', 'Finish', 'Basis'], [[c, T[c]['name'][:105], T[c]['dur'] if T[c]['type'] not in ('TT_Mile', 'TT_FinMile') else '-', T[c]['resp'], d(T[c]['es']), d(T[c]['ef']), T[c]['basis'].split('(')[-1].rstrip(')') if '(' in T[c]['basis'] else 'Baseline'] for c in chain], [1.8, 7.6, 1.1, 1.9, 2.0, 2.0, 1.6], 8.5)
para('The handbook asks for permit requests at least 3 months before the work starts. The chain starts 30 days after Gate 2 and the permit is issued 14 days after Gate 3; the request is in SAR\'s hands about 3 months before construction starts. The handbook also says the request is submitted by the project owner (SAR), not by the contractor, so TG-0620 is the contractor handing the package to SAR.', size=10)

doc.add_heading('5. Logic into the gates', 1)
rows = []
for g in ('DS-0020', 'DS-0360', 'DS-0700', 'PR-0120', 'MS-0090', 'TC-0460', 'TC-0380', 'CO-0015'):
    tg = [p[0] for p in T[g]['preds'] if p[0] in M['new']]
    rows.append([g, T[g]['name'][:62], d(T[g]['ef']), ', '.join(tg) or '-'])
table(['ID', 'Gate / activity', 'Date', 'Now also waits for'], rows, [1.8, 6.8, 2.0, 6.4], 8.5)

doc.add_heading('6. Critical path', 1)
dp = [T[c] for c in M['driving']]
para(f"The longest path runs from the Notice to Proceed on {d(dp[0]['es'])} to Contract Completion on {d(dp[-1]['ef'])}: {len(dp)} activities, all with zero total float. It passes through the three design gates, the Phase 2 railway track chain (prequalification, material submittal and approval, purchase order, 245 days of manufacture, shipping, installation, tie-in), integration testing, trial running, the SAR safety assessment, the Taking-Over certificate and demobilisation.")
doc.add_picture('/home/user/c001/out/Zulfi_BL02_Critical_Path.png', width=Cm(17))
bullets([
    'Contract completion keeps zero float and no activity has negative float.',
    'The TGA and permit activities are not on the longest path: they run in parallel with design and carry float.',
    'The TGA activities closest to the path are the ones to watch (below).',
])
near = sorted([c for c in M['new'] if T[c]['type'] != 'TT_LOE' and T[c]['tf'] <= 30], key=lambda c: T[c]['tf'])
table(['ID', 'Near-critical TGA activity', 'Float (d)', 'Finish'], [[c, T[c]['name'][:72], T[c]['tf'], d(T[c]['ef'])] for c in near], [1.8, 10.2, 1.6, 2.4], 8.5)
para('The end-of-project items (TG-0810, TG-0820, TG-0830, TG-0880, TG-0930) are timed inside the trial-running and safety-assessment windows so that the submissions are ready when SAR starts its review. They have 1 to 7 days of float: any slip in trial running moves them onto the critical path.', size=10)
doc.add_picture('/home/user/c001/out/Zulfi_BL02_TGA_Process_Gantt.png', width=Cm(17))

doc.add_heading('7. Assumptions and open points', 1)
table(['Topic', 'Assumption in the programme', 'To be confirmed with'], [
    ['TGA review times', 'Not given; the ICP and TGA steps use proposed durations (basis T or B)', 'SAR / TGA'],
    ['ICP timing', 'Appointed at mobilisation, before the first design submission', 'SAR / TGA'],
    ['HCIS and Civil Defense', 'HCIS approval 30 days, planned before Gate 3; Civil Defense uses the baseline 45 days', 'HCIS / Civil Defense'],
    ['Work permit review', 'Technical review 30 days and TTF02 review 14 days, so the permit lead is about 3 months', 'SAR Permit Department'],
    ['Design reviews', '14, 21 and 28 days for Concept, Preliminary and Detailed / IFC', 'SAR Engineering'],
    ['Operating rules change', '15 + 15 days (SAR-012-200-02-001), linked to trial running', 'SAR Railway Governance'],
    ['Notice to Proceed', 'Assumed 1 Nov 2026', 'SAR PMO'],
], [3.6, 9.4, 4.0], 9)

doc.add_heading('8. Integrity checks', 1)
neg = sum(1 for t in M['tasks'] if t['tf'] < 0)
table(['Check', 'Result'], [
    ['Activities', f"{len(T)} (545 baseline + 52 new)"], ['Relationships', M['rel_count']], ['Negative float', neg], ['Critical activities (float 0 or less)', '113, as in the previous baseline'],
    ['New activities with no predecessor or no successor', 0], ['Contract completion', d(T['MS-0140']['ef'])], ['Cost loading', 'Unchanged: PERF and CASH resources total SAR 99,999,000 each; new activities carry no cost'],
    ['XER structure', 'Field counts, keys, relationships and code references verified; schedule recomputed from the file and matches'],
], [7, 10], 9)

import extra_data as X
doc.add_heading('9. Phase values and cost', 1)
pv = X.phase_values(); p1 = pv['Phase 1 (Billing)']; p2 = pv['Phase 2 (Billing)']; dal = 1892043
para('The Contract Phase code now follows the phase of the BOQ item. The mapped activity cost carries the design lump sum (BOQ 2.1, SAR 4,889,000) spread over all 16 items, so the Phase 2 items carry SAR 1,892,043 of design that the contract bills in Phase 1.')
table(['Basis', 'Phase 1 (SAR)', 'Phase 2 (SAR)', 'Total (SAR)'], [
    ['Programme cost (mapped activity cost)', f"{p1:,.0f}", f"{p2:,.0f}", f"{p1 + p2:,.0f}"],
    ['Design allocation of the Phase 2 items', f"+{dal:,.0f}", f"-{dal:,.0f}", '0'],
    ['Contract billing basis', f"{p1 + dal:,.0f}", f"{p2 - dal:,.0f}", f"{p1 + p2:,.0f}"],
    ['BOQ (items + 1.1 + 2.1; Phase 2 items)', '65,009,000', '34,990,000', '99,999,000'],
], [7.5, 3.2, 3.2, 3.1], 9)
para('A correction was made in this revision: 36 design activities of the Phase 2 items (3.3, 4.3, 6.1, 7.2) had been coded Phase 1, which showed Phase 1 at SAR 65,971,225 and Phase 2 at SAR 34,027,775. Costs and dates of those activities are unchanged.', size=10)
qp = X.quarterly_progress('/home/user/c001/out/Zulfi_Baseline_Programme_BL02_TGA.xer')
table(['Quarter'] + [q[0] for q in qp], [['Months'] + [f"{q[1]}-{q[2]}" for q in qp], ['Progress value, SAR M'] + [f"{q[3]:.2f}" for q in qp]], [3.4] + [1.5] * 9, 8.5)
doc.add_heading('10. Revision log', 1)
rl = X.revision_log()
import datetime as _dt
_sh = [(_dt.date.fromisoformat(r[4]) - _dt.date.fromisoformat(r[2])).days for r in rl if r[0] not in ('PR-0270', 'PR-2270')]
para(f"{len(rl)} existing activities moved because a submission or a link was added: most by {min(_sh)} to {max(_sh)} days, and the environmental permit application and approval by about four months (the detailed EIA now precedes the application). The lowest float among them is {min(r[6] for r in rl)} days (loop line possession booking); none is on the critical path and contract completion is unchanged.")
table(['ID', 'Activity', 'Start before', 'Start BL02', 'Float'], [[r[0], r[1][:58], r[2], r[4], r[6]] for r in rl], [1.7, 8.3, 2.5, 2.5, 1.6], 8)
doc.save('/home/user/c001/out/Zulfi_BL02_Baseline_Submittal_Report.docx')
print('docx saved')
