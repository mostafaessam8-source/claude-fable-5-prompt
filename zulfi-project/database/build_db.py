"""Builds zulfi.db (SQLite) plus CSV and JSON exports for the Zulfi Train Station project.
Every value comes from the project conversation: the contract BOQ, the baseline programme figures,
the Scope of Works (clause numbers cited) and the decks delivered. Run:  python3 build_db.py
Basis tags: C = contract scope of work, B = baseline programme assumption, S = SAR procedure,
T = to be confirmed with the authority, D = draft proposal not yet in the baseline."""
import sqlite3, csv, json, os, re

OUT = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(OUT, 'zulfi.db')
if os.path.exists(DB): os.remove(DB)
con = sqlite3.connect(DB); cur = con.cursor()
TABLES = {}

def table(name, cols, rows, comment=''):
    cur.execute(f'CREATE TABLE {name} ({", ".join(cols)})')
    ph = ','.join('?' * len(cols))
    cur.executemany(f'INSERT INTO {name} VALUES ({ph})', rows)
    TABLES[name] = ([c.split()[0] for c in cols], rows, comment)

# ---------------------------------------------------------------- project
table('project', ['key TEXT PRIMARY KEY', 'value TEXT'], [
    ('name_en', 'Zulfi Train Station (Zulfi Passenger Railway Station)'),
    ('name_ar', 'محطة قطار الزلفي'),
    ('client', 'Saudi Arabia Railways (SAR)'),
    ('contractor', 'Awj International Contracting Co.'),
    ('funder', 'Zulfi Cooperative Society (الجمعية التعاونية بالزلفي)'),
    ('line', 'North-South Railway (NSR), Zulfi City, chainage TK 254'),
    ('delivery', 'EPC (design and build)'),
    ('contract_value_sar_excl_vat', '99999000'),
    ('duration_months', '26'),
    ('ntp_assumed', '2026-11-01 (NOT CONFIRMED; all calendar dates move with the NTP)'),
    ('taking_over_baseline', '2028-12-20'),
    ('contract_completion_baseline', '2028-12-31'),
    ('float_to_completion_days', '0'),
    ('station_building', 'single storey, about 1,100 m2'),
    ('platform', '1 single-face platform, about 500 m'),
    ('capacity', '400 passengers per day (100 per trip)'),
    ('operations', 'Bi-directional running, 50 km/h, ETCS Level 2 (per contractor kick-off material)'),
    ('classification', 'CAPEX, Construction, Complex, Mega, Group 4 (project information form)'),
    ('first_6_month_funding_requested_sar', '15000000'),
    ('first_6_month_baseline_need_sar', '14727801'),
    ('advance_payment_assumption', '10% recovered proportionally (assumption)'),
])

# ---------------------------------------------------------------- BOQ
SCOPE = {
 '1.1': 'Contractor general requirements: mobilisation, site establishment, project management and staff, bonds and insurances, management plans, permits and authority approvals, reporting and demobilisation (lump sum).',
 '2.1': 'Design of all works through Concept, Preliminary and Detailed Design / IFC stages, including submittals to SAR for review and approval (lump sum, allocated to the BOQ items).',
 '3.1': 'Design and construction of the passenger station main building, GEA 1,100 m2, single storey: structure, architectural finishes and building services.',
 '3.2': 'Supply, installation and commissioning of IT equipment for the station building.',
 '3.3': 'Supply and installation of furniture, fixtures and equipment (FF&E) for the station building.',
 '4.1': 'Substation and SEC works: power supply room and incoming electrical connection for the station.',
 '4.2': 'Design and construction of the firefighting building, GEA 518 m2.',
 '4.3': 'Design and construction of the generator room, 62 m2, with the standby generator.',
 '4.4': 'Construction of the underground water tank, including related fittings and connections.',
 '5.1': 'Site preparation and underground utilities for the 15,000 m2 plot: earthworks, drainage, water, sewage and cable ducts.',
 '5.2': 'Car parking sheds, 1,375 m2 (80 lots in the management model).',
 '5.3': 'Perimeter fence works, 500 m.',
 '5.4': 'Automatic gate system, 2 gates.',
 '6.1': 'Station access road, about 1,700 m dual carriageway, including pavement, drainage, lighting and markings.',
 '6.2': 'Signalling and telecommunication systems for the station and loop line.',
 '6.3': 'External above-ground works: paving, landscaping and finishing around the station.',
 '7.2': 'Railway track works for the loop line, 2,500 m.',
 '7.3': 'Railway turnout works connecting the loop line to the main line.',
}
note = 'Scope descriptions are indicative, taken from BOQ item titles and quantities; confirm against contract specifications.'
BOQ = [  # ref, package, group, phase, lead, value, descriptor
 ('1.1', 'Preliminaries & General Requirements (lump sum)', 'General', 'Phase 1', '', 4900000, ''),
 ('2.1', 'Design Works (lump sum, allocated to items)', 'General', 'Phase 1', '', 4889000, ''),
 ('3.1', 'Main Building (GEA 1,100 m2)', 'Main Building', 'Phase 1', 'Short', 2250000, 'GEA 1,100 m2, single storey'),
 ('3.2', 'IT Equipment', 'Main Building', 'Phase 1', 'Short', 400000, ''),
 ('3.3', 'Furniture, Fixtures & Equipment (FF&E)', 'Main Building', 'Phase 2', 'Short', 1900000, ''),
 ('4.1', 'Substation & SEC Works', 'Ancillary Buildings', 'Phase 1', 'Long', 3690000, ''),
 ('4.2', 'Firefighting Building (GEA 518 m2)', 'Ancillary Buildings', 'Phase 1', 'Short', 1490000, 'GEA 518 m2'),
 ('4.3', 'Generator Room', 'Ancillary Buildings', 'Phase 2', 'Long', 990000, 'BOQ 62 m2'),
 ('4.4', 'Underground Water Tank', 'Ancillary Buildings', 'Phase 1', 'Short', 2331000, ''),
 ('5.1', 'Site Works & Underground Utilities', 'External Works', 'Phase 1', 'Short', 10880000, 'Plot 15,000 m2'),
 ('5.2', 'Car Parking Sheds', 'External Works', 'Phase 1', 'Short', 790000, 'BOQ 1,375 m2 (80 lots in management model)'),
 ('5.3', 'Fence Works', 'External Works', 'Phase 1', 'Short', 200000, 'BOQ 500 m'),
 ('5.4', 'Automatic Gate System', 'External Works', 'Phase 1', 'Short', 300000, 'BOQ 2 no.'),
 ('6.1', 'Access Road (Station Road)', 'Road Works', 'Phase 2', 'Short', 10200000, 'about 1,700 m dual carriageway'),
 ('6.2', 'Signalling & Telecommunication', 'Railway Systems', 'Phase 1', 'Long', 14900000, ''),
 ('6.3', 'External Works (above ground)', 'Road Works', 'Phase 1', 'Short', 8990000, ''),
 ('7.2', 'Railway Track Works (Loop Line, 2,500 m)', 'Railway Systems', 'Phase 2', 'Long', 21900000, '2,500 m loop line'),
 ('7.3', 'Railway Turnout Works', 'Railway Systems', 'Phase 1', 'Long', 8999000, ''),
]
assert sum(r[5] for r in BOQ) == 99999000
table('boq_items', ['ref TEXT PRIMARY KEY', 'package TEXT', 'grp TEXT', 'phase TEXT', 'lead_class TEXT', 'value_sar INTEGER', 'descriptor TEXT', 'scope_description TEXT'],
      [(r[0], r[1], r[2], r[3], r[4], r[5], r[6], SCOPE[r[0]]) for r in BOQ], note)

# ---------------------------------------------------------------- phases
table('phases', ['phase TEXT', 'stage TEXT', 'start_month INTEGER', 'finish_month INTEGER', 'start_date_indicative TEXT', 'finish_date_indicative TEXT'], [
    ('Both', 'Design', 2, 11, '2026-12-01', '2027-09-21'),
    ('Phase 1', 'Procurement', 7, 18, '2027-05-21', '2028-04-05'),
    ('Phase 1', 'Construction', 12, 20, '2027-10-09', '2028-06-21'),
    ('Phase 1', 'Testing and commissioning', 14, 26, '2027-12-21', '2028-12-09'),
    ('Phase 2', 'Procurement', 11, 22, '2027-09-24', '2028-08-09'),
    ('Phase 2', 'Construction', 12, 24, '2027-10-23', '2028-10-21'),
    ('Phase 2', 'Testing and commissioning', 18, 25, '2028-04-01', '2028-11-19'),
], 'Phase 1 = 12 items, Phase 2 = 4 items (3.3, 4.3, 6.1, 7.2). Dates assume NTP 1-Nov-2026 and are indicative.')

table('milestones', ['id TEXT PRIMARY KEY', 'name TEXT', 'month_from_ntp INTEGER', 'basis TEXT', 'note TEXT'], [
    ('MS-0010', 'Notice to Proceed', 1, 'B', 'Date to be confirmed'),
    ('MS-0020', 'Access permits obtained', 1, 'B', 'Tender note: month 1'),
    ('MS-0030', 'Gate 1 - Concept design approved', 3, 'B', 'Tender window: months 2 to 3'),
    ('MS-0040', 'Gate 2 - Preliminary design approved', 6, 'B', 'Tender window: months 4 to 6'),
    ('MS-0050', 'Phase 1 procurement start', 7, 'B', '15 days after Gate 2'),
    ('MS-0060', 'Gate 3 - Detailed design (IFC) approved', 11, 'B', 'Tender window: months 7 to 11'),
    ('MS-0080', 'Phase 2 procurement start', 11, 'B', ''),
    ('MS-0090', 'Work permit and construction start', 12, 'B', '14 days after Gate 3'),
    ('MS-0100', 'Signalling and turnout materials on site', None, 'B', 'Long-lead delivery (month not recorded here)'),
    ('MS-0110', 'Track materials on site', None, 'B', 'Long-lead delivery (month not recorded here)'),
    ('MS-0120', 'All construction works complete', 24, 'B', 'Before testing and trial running'),
    ('MS-0130', 'Taking-Over of all works', 26, 'B', 'Contract completion 31 Dec 2028; zero float'),
])

# ---------------------------------------------------------------- cash flow (SAR million)
Q = [(1, 3, 3.668311175543045, 13.284608484997914), (4, 6, 1.6699528843790443, 1.4431927521244432), (7, 9, 10.78387521558744, 6.3614306194335875),
     (10, 12, 15.124265159111593, 12.648876880559424), (13, 15, 34.941698465447594, 28.378140501517876), (16, 18, 13.718885141785673, 15.821818484816779),
     (19, 21, 9.985002732961702, 12.373323973884503), (22, 24, 8.297606905415805, 8.059146214874223), (25, 26, 1.809402319768198, 1.6284620877913785)]
Sm = [(1, 6, 5.33826405992209, 14.727801237122357), (7, 12, 25.908140374699034, 19.01030749999301), (13, 18, 48.66058360723327, 44.19995898633465),
      (19, 24, 18.282609638377505, 20.432470188758725), (25, 26, 1.809402319768198, 1.6284620877913785)]
def cf(rows, label):
    tot = sum(r[3] for r in rows); cum = 0; out = []
    for i, (m0, m1, perf, net) in enumerate(rows, 1):
        cum += net; out.append((f'{label}{i}', m0, m1, round(perf, 3), round(net, 3), round(cum / tot * 100, 1)))
    return out
table('cash_flow_quarterly', ['period TEXT', 'month_from INTEGER', 'month_to INTEGER', 'progress_value_sar_m REAL', 'net_cash_sar_m REAL', 'cumulative_net_cash_pct REAL'], cf(Q, 'Q'),
      'Progress value = work done; net cash = invoiced after the 10% advance (assumption).')
table('cash_flow_semiannual', ['period TEXT', 'month_from INTEGER', 'month_to INTEGER', 'progress_value_sar_m REAL', 'net_cash_sar_m REAL', 'cumulative_net_cash_pct REAL'], cf(Sm, 'H'))
table('cost_components', ['component TEXT', 'sar REAL'], [
    ('Preliminaries', 4899999.98), ('Design', 4889000.01), ('Engineering', 4510500.0), ('Procurement', 9021000.0), ('Material delivered', 23409300.0), ('Construction and T&C', 53269200.04)],
      'Planning baseline split of the SAR 99.999 M contract value.')

# ---------------------------------------------------------------- TGA, approvals, durations
table('tga_requirements', ['requirement TEXT', 'contract_wording TEXT', 'programme_meaning TEXT', 'clause TEXT'], [
    ('Management and Control of Change', 'Implement the TGA guidance on change management (TGA-R-000-GDN-230504-06 per SAR procedure SAR-012-200-02-001).', 'Changes to approved design or scope are risk-assessed and approved before they are built.', '18'),
    ('Independent Competent Person', 'Appointment of an Independent Competent Person (ICP).', 'Proposal: appoint at mobilisation, before the first design submission.', '18'),
    ('Safe Design and Construction', 'Safe by Design at every design stage, ALARP, RAM to EN 50126.', 'Hazard analysis, safety case and risk register at Preliminary; hazards to ALARP in Detailed.', '18, 24, 25'),
    ('Environmental', 'EIA, Environmental Permit for Construction before works, approved wastewater discharge.', 'High-level EIA at Preliminary; detailed EIA to GAMEP; permit before the work permit (Month 12).', '18, 45'),
])
table('authorities', ['entity TEXT', 'approves_or_reviews TEXT', 'stage TEXT', 'contractor_documents TEXT', 'source TEXT'], [
    ('SAR Engineering and Projects', 'Design at each phase gate, IDC/IDR sign-off, submittals, readiness reviews, Taking-Over', 'All stages', 'Design basis, drawings, specifications, method statements', 'C 8, 21, 22'),
    ('TGA', 'Change control, Independent Competent Person, safe design and construction', 'Design to operation', 'ICP appointment, safety case, change requests', 'C 18'),
    ('HCIS', 'Security and fire design via HCIS-approved consultant; works by HCIS-approved contractor', 'Detailed design to installation', 'HCIS design approval, contractor approval', 'C section 2 and 42'),
    ('Civil Defense', 'Fire protection and life safety (NFPA / SBC)', 'Detailed design, completion', 'Fire design package, inspection certificate', 'C section 2'),
    ('GAMEP (General Authority of Meteorology and Environment Protection, as written in the scope)', 'Detailed EIA and Environmental Permit for Construction', 'Preliminary design to before works', 'High-level and detailed EIA', 'C 18, 45'),
    ('SEC, NWC, Municipality', 'Power, potable water, sewerage and drainage connections', 'Applications early; connect before testing', 'Load schedules, applications, agreements', 'C 33'),
    ('Road authority, pipeline and line owners', 'Highway junction tie-in; crossings near pipelines and transmission lines (e.g. ARAMCO)', 'Detailed design to works', 'Junction design, clearance letters', 'C 31, 43 (authority to be identified)'),
])
table('approval_durations', ['activity TEXT', 'days TEXT', 'owner TEXT', 'basis TEXT'], [
    ('Concept design review by SAR', '14', 'SAR Engineering', 'B'), ('Preliminary design review by SAR', '21', 'SAR Engineering', 'B'),
    ('Detailed and IFC design review by SAR', '28', 'SAR Engineering', 'B'), ('Work permit after Gate 3', '14', 'SAR', 'B'),
    ('SEC permanent power supply agreement', '90 (120 if needed)', 'SEC', 'B'), ('Possession booking for track tie-in', '30', 'SAR Operations', 'B'),
    ('Safety assessment', '15 (about 30 recommended)', 'SAR Safety, ICP', 'B'), ('Taking-Over certificate review and issue', '11', 'SAR', 'B'),
    ('Operating-rule critical change (15 + 15), SAR-012-200-02-001', '30', 'SAR Governance, RBWG', 'S'),
    ('SAR functional audit planned-audit notice, SAR-012-600-3-001', '42 minimum (6 weeks)', 'SAR SRGC', 'S'),
    ('TGA reviews and ICP verification', 'TBC', 'TGA, ICP', 'T'), ('HCIS, Civil Defense, GAMEP, NWC, Municipality, road authority', 'TBC', 'Each authority', 'T'),
])
table('documents_by_stage', ['stage TEXT', 'documents TEXT', 'approved_by TEXT'], [
    ('Mobilise and plan', 'DEMP, safety management plan, RAM plan, document control procedure, ICP appointment, risk register', 'SAR, TGA'),
    ('Design', 'Design Basis Reports, drawings and calculations, VE proposals, hazard analysis and safety case, high-level EIA, RAM prediction reports, meeting ToR and minutes, IDC/IDR sheets', 'SAR (phase gates), ICP'),
    ('Permits', 'Detailed EIA, HCIS design approval, Civil Defense approval, utility applications and agreements, junction approval, work permit and possession requests', 'GAMEP, HCIS, Civil Defense, utilities, SAR'),
    ('Execution', 'Material submittals, shop and fabrication drawings, method statements, lift plans, ITPs, inspection requests, FAT procedures and reports, NCRs, red-line drawings', 'SAR, ICP'),
    ('Test and handover', 'Test procedures and reports, safety assessment, trial running report, as-built drawings, O&M manuals with spare parts list, Taking-Over and handover certificates', 'SAR, TGA, HCIS, Civil Defense'),
])
table('design_gates', ['gate TEXT', 'sar_stage TEXT', 'completion TEXT', 'month INTEGER', 'review_days INTEGER', 'content TEXT'], [
    ('Gate 1 Concept', '1a', '0-10%', 3, 14, 'Design Basis Reports all disciplines, concept drawings, rough cost estimate'),
    ('Gate 2 Preliminary', '2a', '10-30%', 6, 21, 'Preliminary reports and drawings, VE, high-level EIA, hazard analysis, safety case, risk register, surveys, BoQ'),
    ('Gate 3 Detailed / IFC', '3a / 3b', '30-100%', 11, 28, 'Coordinated detailed drawings, final specifications, hazards to ALARP, RAM reports, HCIS and Civil Defense approvals submitted, final IDC/IDR, IFC suite'),
], 'Workflow at every stage: internal design check (SAR-025-400-2-028), IDC/IDR, submit, SAR review (CRS), resubmit, SAR Phase Gate Review.')

# ---------------------------------------------------------------- status and open points
table('project_status', ['item', 'status', 'detail'] and ['item TEXT', 'status TEXT', 'detail TEXT'], [
    ('Contractor Project Manager', 'Done', 'Appointed; contract signed'),
    ('Construction Manager and Planning Engineer', 'In progress', 'Interviews under way'),
    ('Project design firm', 'In progress', 'Contractor has started appointing the design firm'),
    ('Funding for the first 6 months', 'In progress', 'Zulfi Cooperative Society asked to provide SAR 15 M (baseline need SAR 14.7 M)'),
    ('Purchase Order', 'Waiting', 'With SAR Finance; the Notice to Proceed starts once it is issued'),
], 'Status as given by the project manager at the time of the CEO briefing.')
table('open_points', ['point TEXT', 'owner TEXT'], [
    ('Review times of TGA and of the Independent Competent Person', 'SAR / TGA'), ('HCIS and Civil Defense review times', 'SAR / authorities'),
    ('Whether the ICP must be in place before the first design submission', 'SAR / TGA'), ('Design review windows 14, 21 and 28 days', 'SAR'),
    ('Possession windows and safety assessment duration', 'SAR Operations'), ('Trial-running duration and operational readiness criteria', 'SAR Operations'),
    ('Notice to Proceed date', 'SAR PMO'), ('Per-package long-lead manufacture days (only the 150 to 245 day range is recorded)', 'Contractor / suppliers'),
    ('The TGA guidance documents themselves were not provided', 'SAR'),
    ('Which entity issues the construction environmental permit (scope says GAMEP)', 'SAR'),
])

# ---------------------------------------------------------------- draft TGA process activities for the next baseline
TG = [  # id, name, duration_days, predecessors, basis, note
 ('TG-0010', 'Appoint Independent Competent Person (ICP)', 14, 'MS-0010:FS', 'D', 'Proposal'),
 ('TG-0020', 'Prepare DEMP, safety plan and RAM plan', 21, 'MS-0010:SS', 'C', 'Clauses 19, 20, 24, 25; duration proposed'),
 ('TG-0030', 'SAR review of DEMP and plans', 14, 'TG-0020:FS', 'D', 'Uses the 14-day concept review window'),
 ('TG-0040', 'ICP review of safety plan and risk process', 10, 'TG-0010:FS;TG-0020:FS', 'D', ''),
 ('TG-0100', 'Concept: Safe-by-Design hazard identification', 21, 'TG-0020:SS+14', 'C', 'Clause 24'),
 ('TG-0110', 'ICP check of Concept safety inputs', 7, 'TG-0100:FS;TG-0040:FS', 'D', 'Successor: MS-0030 Gate 1'),
 ('TG-0200', 'Preliminary hazard analysis, safety case, risk register', 42, 'MS-0030:FS', 'C', 'Clause 35; duration proposed'),
 ('TG-0210', 'High-level EIA (Preliminary design)', 35, 'MS-0030:FS', 'C', 'Clause 45; duration proposed'),
 ('TG-0220', 'ICP review of safety case', 10, 'TG-0200:FS', 'D', 'Successor: MS-0040 Gate 2'),
 ('TG-0310', 'Detailed EIA to GAMEP and Environmental Permit for Construction', 75, 'TG-0210:FS', 'T', 'Authority time TBC; successor MS-0090'),
 ('TG-0320', 'HCIS design approval (HCIS-approved consultant)', 30, 'MS-0040:FS', 'T', 'Authority time TBC; successor MS-0060'),
 ('TG-0330', 'Civil Defense design approval', 30, 'MS-0040:FS', 'T', 'Authority time TBC; successor MS-0060'),
 ('TG-0340', 'Utility applications and agreements (SEC 90 days)', 90, 'MS-0040:SS', 'B', 'SEC 90 days (120 if needed)'),
 ('TG-0400', 'Close hazards to ALARP; residual hazard transfer list', 21, 'MS-0040:FS', 'C', 'Clause 36'),
 ('TG-0410', 'ICP design verification statement', 10, 'TG-0400:FS', 'D', 'Successor: MS-0060 Gate 3'),
 ('TG-0510', 'Agree ICP inspection plan for construction', 7, 'MS-0060:FS', 'D', 'Successor: MS-0090'),
 ('TG-0600', 'ICP witness of critical works (level of effort)', None, 'MS-0090:SS', 'D', 'Spans MS-0090 to MS-0120'),
 ('TG-0710', 'Safety assessment', 15, 'MS-0120:FS', 'B', 'About 30 days recommended'),
 ('TG-0720', 'ICP final verification report', 7, 'TG-0710:FS', 'D', ''),
 ('TG-0740', 'Civil Defense fire inspection certificate', 14, 'MS-0120:FS', 'T', 'Authority time TBC'),
 ('TG-0750', 'HCIS security systems acceptance', 14, 'MS-0120:FS', 'T', 'Authority time TBC'),
 ('TG-0770', 'SAR operational readiness review', 7, 'TG-0720:FS', 'D', ''),
 ('TG-0780', 'Taking-Over certificate review and issue', 11, 'TG-0770:FS;TG-0740:FS;TG-0750:FS', 'B', 'Successor: MS-0130 Taking-Over'),
]
table('tga_process_activities_draft', ['activity_id TEXT PRIMARY KEY', 'name TEXT', 'duration_days INTEGER', 'predecessors TEXT', 'basis TEXT', 'note TEXT'], TG,
      'DRAFT: proposed TGA-process activities and logic for the next baseline submittal. Not yet loaded into a P6 file; the baseline XER and scheduling engine were lost (see README). Durations marked D or T need confirmation.')

# ---------------------------------------------------------------- deliverables inventory
table('deliverables', ['file TEXT', 'description', 'status TEXT'] and ['file TEXT', 'description TEXT', 'status TEXT'], [
    ('deliverables/Zulfi_TGA_Approvals_Workflow_EN.pptx', 'SAR-template deck, 14 slides: TGA clause 18, approvals, workflows, days, documents, critical path', 'In repository'),
    ('deliverables/Zulfi_Long_Lead_Items_EN.pptx', 'SAR-template deck, 2 slides: long-lead packages and schedule protection', 'In repository'),
    ('deliverables/Zulfi_Procurement_List.xlsx', '16 procurement packages with lead class, window and value', 'In repository'),
    ('src/ceo-briefing/build_ceo.js', 'Source of the CEO Briefing deck (11 slides), rebuilt from the conversation; needs deck.json and map.png', 'Recovered source'),
    ('recovered/*', 'Scripts read during the conversation: Awj kick-off builders (lib.py, kick_motion.py) and the English schedule-review deck (build_en.js, motion_en.py)', 'Recovered source'),
    ('Zulfi_Baseline_Programme.xer', 'P6 baseline (518 activities, submittal separated from approval, zero float)', 'LOST: container reset; resend the copy delivered earlier'),
    ('Planning engine (engine.py, xer.py, builders)', 'CPM with 3 calendars, cost loading, cash flow, XER export', 'LOST: container reset'),
    ('Zulfi_BOQ.xlsx, BOQ Mapping, Control workbook, narrative, cash-flow and tracker workbooks', 'Earlier deliverables', 'LOST from the container; the BOQ is in boq_items'),
    ('Zulfi_CEO_Briefing_EN.pptx, Zulfi_Station_Kickoff_Meeting_Redesigned.pptx, English SAR decks', 'Earlier decks', 'LOST from the container; delivered to the user in chat'),
])

con.commit()
# ---------------------------------------------------------------- views
cur.executescript('''
CREATE VIEW v_long_lead AS SELECT ref, package, phase, value_sar FROM boq_items WHERE lead_class = 'Long';
CREATE VIEW v_value_by_group AS SELECT grp, COUNT(*) AS items, SUM(value_sar) AS value_sar FROM boq_items GROUP BY grp;
CREATE VIEW v_value_by_phase AS SELECT phase, COUNT(*) AS items, SUM(value_sar) AS value_sar FROM boq_items GROUP BY phase;
''')
con.commit()

# ---------------------------------------------------------------- exports
os.makedirs(os.path.join(OUT, 'csv'), exist_ok=True)
allj = {}
for name, (cols, rows, comment) in TABLES.items():
    with open(os.path.join(OUT, 'csv', name + '.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f); w.writerow(cols); w.writerows(rows)
    allj[name] = {'comment': comment, 'rows': [dict(zip(cols, r)) for r in rows]}
json.dump(allj, open(os.path.join(OUT, 'zulfi_data.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(os.path.join(OUT, 'schema.sql'), 'w', encoding='utf-8').write('\n'.join(r[0] + ';' for r in cur.execute("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL").fetchall()))
print({k: len(v[1]) for k, v in TABLES.items()})
print('contract total', cur.execute('SELECT SUM(value_sar) FROM boq_items').fetchone(), 'long-lead', cur.execute('SELECT SUM(value_sar) FROM v_long_lead').fetchone())
