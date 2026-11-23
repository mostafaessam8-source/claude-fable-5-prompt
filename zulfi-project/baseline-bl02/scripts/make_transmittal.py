from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
doc = Document(); sec = doc.sections[0]; sec.page_width, sec.page_height = Cm(21), Cm(29.7)
for a in ('left_margin', 'right_margin', 'top_margin', 'bottom_margin'): setattr(sec, a, Cm(2.2))
st = doc.styles['Normal']; st.font.name = 'Calibri'; st.font.size = Pt(10.5)
TEAL = RGBColor(0, 0x77, 0x8B)
def shade(c, f):
    p = c._tc.get_or_add_tcPr(); s = OxmlElement('w:shd'); s.set(qn('w:val'), 'clear'); s.set(qn('w:color'), 'auto'); s.set(qn('w:fill'), f); p.append(s)
p = doc.add_paragraph(); r = p.add_run('Transmittal: Baseline Programme Submittal, Revision 01'); r.bold = True; r.font.size = Pt(18); r.font.color.rgb = TEAL
p = doc.add_paragraph(); r = p.add_run('Zulfi Passenger Railway Station | Programme ZULFI-BL02'); r.font.size = Pt(12)
t = doc.add_table(rows=0, cols=2); t.style = 'Table Grid'
for k, v in [('To', 'SAR Project Management Office'), ('Subject', 'Baseline programme with the TGA process, SAR work permit and authority approvals, for review'), ('Revision', '01 (ZULFI-BL02)'), ('Notice to Proceed', 'Assumed 1 Nov 2026, not confirmed; all dates move with it'), ('Contract completion', '31 Dec 2028, zero float; Taking-Over 20 Dec 2028')]:
    c = t.add_row().cells; c[0].text = k; c[1].text = v; shade(c[0], 'E6F1F4'); c[0].paragraphs[0].runs[0].bold = True
    c[0].width = Cm(4); c[1].width = Cm(12.5)
doc.add_paragraph()
doc.add_heading('Contents', 2)
rows = [('01', 'Zulfi_Baseline_Programme_BL02_TGA.xer', 'Primavera P6 programme: 597 activities, 1,086 relationships'),
 ('02', 'Zulfi_BL02_Baseline_Submittal_Report.docx / .pdf', 'Method, logic, critical path, phase values, revision log, assumptions'),
 ('03', 'Zulfi_BL02_TGA_Logic_and_Critical_Path.xlsx', 'New activities, logic links, submit-review pairs, critical path, checks, revision log'),
 ('04', 'Zulfi_BL02_Critical_Path_and_TGA_Gantt.pdf (and PNG)', 'Critical path chart and TGA process chart'),
 ('05', 'ZULFI-BOQ_Corrected.xlsx', 'BOQ and cost mapping with the phase reconciliation'),
 ('06', 'Zulfi_Programme_Discussion_EN.pptx / .pdf', '10-slide discussion deck for senior management'),
 ('07', 'Supporting files (unchanged)', 'Cash flow and performance workbook, long-lead tracker, engineering tracking sheet, narrative report')]
t = doc.add_table(rows=1, cols=3); t.style = 'Table Grid'
for i, h in enumerate(['No.', 'File', 'Content']):
    c = t.rows[0].cells[i]; c.text = ''; r = c.paragraphs[0].add_run(h); r.bold = True; r.font.color.rgb = RGBColor(255, 255, 255); shade(c, '00778B')
for row in rows:
    c = t.add_row().cells
    for i, v in enumerate(row): c[i].text = v
for row in t.rows:
    for i, w in enumerate([1.5, 7.2, 7.8]): row.cells[i].width = Cm(w)
doc.add_paragraph()
doc.add_heading('What this revision does', 2)
for b in ['Adds 52 TGA, work-permit and authority activities in WBS 09, linked to the design gates, the work permit, possession, trial running and Taking-Over.',
          'Keeps every submission as its own activity (contractor) and every review or approval as its own activity (SAR or authority).',
          'Contract completion stays at 31 Dec 2028 with zero float; no activity has negative float; the critical path is the 35-activity longest path from NTP to completion.',
          'Corrects the Contract Phase coding of 36 design activities of the Phase 2 items; phase values reconcile to the BOQ (65,009,000 and 34,990,000) through a SAR 1,892,043 design bridge.',
          '21 existing activities moved by a few days because a submission was added before them; none is critical (see the revision log).']:
    doc.add_paragraph(b, style='List Bullet')
doc.add_heading('SAR is asked to confirm', 2)
for b in ['Review times of TGA and the Independent Competent Person, and when the ICP must be appointed.', 'HCIS, Civil Defense, GAMEP and utility review times.', 'SAR design review windows (14, 21, 28 days), work-permit technical review and TTF02 review, possession windows and the safety assessment duration.', 'The Notice to Proceed date.']:
    doc.add_paragraph(b, style='List Bullet')
doc.add_paragraph()
doc.add_paragraph('Planning Manager, Zulfi Passenger Railway Station Project')
doc.save('/home/user/c001/out/Zulfi_BL02_Transmittal.docx'); print('ok')
