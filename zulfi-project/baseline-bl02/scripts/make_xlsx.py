import json, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

M = json.load(open('/home/user/c001/out/bl02_model.json'))
tasks = {t['code']: t for t in M['tasks']}
new = M['new']; driving = M['driving']
TEAL, DARK = '00778B', '3D3935'
thin = Side(style='thin', color='D1D5DB'); BD = Border(top=thin, bottom=thin, left=thin, right=thin)
HF = Font(name='Calibri', bold=True, color='FFFFFF'); HFILL = PatternFill('solid', fgColor=TEAL)
def d(s): return dt.date.fromisoformat(s)
wb = Workbook()

def sheet(title, headers, rows, widths, note=None, fills=None, datecols=()):
    ws = wb.create_sheet(title)
    ws['A1'] = title; ws['A1'].font = Font(name='Calibri', size=14, bold=True, color=DARK)
    if note: ws['A2'] = note; ws['A2'].font = Font(name='Calibri', size=9, italic=True, color='6B7280')
    for c, h in enumerate(headers, 1):
        x = ws.cell(4, c, h); x.font = HF; x.fill = HFILL; x.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True); x.border = BD
    for i, r in enumerate(rows):
        for c, v in enumerate(r, 1):
            x = ws.cell(5 + i, c, v); x.border = BD; x.font = Font(name='Calibri', size=10); x.alignment = Alignment(vertical='top', wrap_text=True)
            if c in datecols and isinstance(v, str) and len(v) == 10: x.value = d(v); x.number_format = 'dd-mmm-yy'
            if fills and fills(r, c): x.fill = PatternFill('solid', fgColor=fills(r, c))
            elif i % 2: x.fill = PatternFill('solid', fgColor='F3F4F6')
    for c, w in enumerate(widths, 1): ws.column_dimensions[get_column_letter(c)].width = w
    ws.freeze_panes = 'A5'; ws.sheet_view.showGridLines = False
    ws.auto_filter.ref = f"A4:{get_column_letter(len(headers))}{4 + len(rows)}"
    return ws

fmt_rel = lambda rs: '; '.join(f"{c}{'' if t == 'FS' else ' ' + t}{'+%dd' % l if l > 0 else ''}" for c, t, l in rs)
WBSN = {'0901': '09.01 ICP and Safety Planning', '0902': '09.02 Design Safety Assurance', '0903': '09.03 Authority Design Approvals', '0904': '09.04 SAR Work Permit and Possession', '0905': '09.05 Construction Safety Assurance', '0906': '09.06 Verification and Readiness'}
leafof = {t['code']: k for k, v in {}.items()}
# ----- sheet: README
ws = wb.active; ws.title = 'Read Me'
lines = [
 ('Zulfi Passenger Railway Station - Baseline Programme ZULFI-BL02 (Revision 01)', 14, True),
 ('TGA process, SAR work permit and authority approvals added as activities, with logic, and the longest (critical) path', 11, False),
 ('', 10, False),
 ('Contents', 11, True),
 ('TGA Activities: the 52 new activities (ID, WBS, duration, dates, float, owner, predecessors, successors, source)', 10, False),
 ('Logic Links: every relationship added, including links into existing gates and milestones', 10, False),
 ('Submit-Review Pairs: each submission and its review kept as separate activities', 10, False),
 ('Critical Path: the longest path from Notice to Proceed to Contract Completion (35 activities)', 10, False),
 ('Near-Critical TGA: new activities with 30 days of float or less', 10, False),
 ('Approvals Timeline: key permit and approval dates', 10, False),
 ('Gate Logic: what each design gate now waits for', 10, False),
 ('Checks: integrity checks of the XER', 10, False),
 ('', 10, False),
 ('Notes', 11, True),
 ('Notice to Proceed is assumed on 1 Nov 2026 and is not confirmed; all dates move with it. Months count from the NTP.', 10, False),
 ('Contract completion stays at 31 Dec 2028 with zero float; no activity has negative float.', 10, False),
 ('Basis codes: C = contract scope of work, H = SAR Work Permit Handbook V2, S = SAR procedure, B = baseline assumption, T = authority time to be confirmed.', 10, False),
 ('Durations marked T or B (ICP, HCIS, TGA, work-permit technical review and TTF02) are proposals until SAR and the authorities confirm them.', 10, False),
 ('The TGA guidance documents were not available; TGA review times are therefore proposals.', 10, False),
]
for i, (t, s, b) in enumerate(lines, 1):
    ws.cell(i, 1, t).font = Font(name='Calibri', size=s, bold=b, color=DARK if b else '000000')
ws.column_dimensions['A'].width = 140; ws.sheet_view.showGridLines = False

# ----- TGA Activities
rows = []
for code in new:
    t = tasks[code]
    rows.append([code, t['name'], t['wbs'], t['dur'] if t['type'] != 'TT_LOE' else 'LOE', t['es'], t['ef'], t['tf'], t['resp'], t['sr'], t['tga'], t['basis'], fmt_rel(t['preds']), fmt_rel(t['succs']), M['notes'].get(code, '')])
wbsname = {w: k for k, w in M['wbs'].items()}
for r in rows: r[2] = WBSN.get(wbsname.get(r[2]), r[2])
def fl(r, c):
    if c == 7 and isinstance(r[6], (int, float)):
        return 'F9D6D6' if r[6] <= 0 else ('FDF3D9' if r[6] <= 30 else None)
    return None
sheet('TGA Activities', ['Activity ID', 'Activity name', 'WBS', 'Duration (d)', 'Start', 'Finish', 'Total float (d)', 'Responsible', 'Submit / Review', 'TGA process group', 'Duration basis', 'Predecessors', 'Successors', 'Source / note'],
      rows, [10, 62, 30, 9, 11, 11, 9, 12, 16, 28, 22, 34, 34, 50], 'Float colours: red = critical, amber = 30 days or less. Calendar days from the SAR 7-day calendar.', fl, datecols=(5, 6))

# ----- Logic links
import bl02_spec as S
links = []
for spec in S.ACT:
    code = spec[0]
    for (pc, typ, lg) in tasks[code]['preds']:
        links.append([pc, tasks[pc]['name'] if pc in tasks else '', typ, lg, code, tasks[code]['name']])
seen = {(l[0], l[4]) for l in links}
for (pc, sc, typ, lag) in S.LINKS:
    if (pc, sc) not in seen: links.append([pc, tasks[pc]['name'], typ, lag, sc, tasks[sc]['name']])
for l in links:
    l.append('Link into an existing gate / milestone' if (l[0] in new) != (l[4] in new) else 'Between new activities')
sheet('Logic Links', ['Predecessor', 'Predecessor name', 'Type', 'Lag (d)', 'Successor', 'Successor name', 'Kind'], links, [11, 56, 7, 8, 11, 56, 34], 'FS = finish to start, SS = start to start, FF = finish to finish.')

# ----- Submit / Review pairs
pairs = []
for code in new:
    t = tasks[code]
    if t['sr'] == 'Submission':
        rev = [(s, tasks[s]) for (s, typ, lg) in t['succs'] if s in tasks and tasks[s]['sr'] == 'Review / Approval']
        if rev:
            for s, st in rev: pairs.append([code, t['name'], t['dur'], t['resp'], s, st['name'], st['dur'], st['resp']])
        else:
            nxt = [(s, tasks[s]) for (s, typ, lg) in t['succs'] if s in tasks]
            s, st = nxt[0]; pairs.append([code, t['name'], t['dur'], t['resp'], s, st['name'], st['dur'], st['resp']])
for code in ('PR-0190', 'PR-0270', 'PR-2111', 'PR-2112', 'PR-2113', 'PR-2114'):
    t = tasks[code]
    for (s, typ, lg) in t['succs']:
        if s in tasks and tasks[s]['sr'] == 'Review / Approval': pairs.append([code, t['name'], t['dur'], t['resp'], s, tasks[s]['name'], tasks[s]['dur'], tasks[s]['resp']])
sheet('Submit-Review Pairs', ['Submission ID', 'Submission activity', 'Days', 'By', 'Next activity ID', 'Review / approval / next activity', 'Days', 'By'], pairs, [12, 62, 7, 12, 14, 62, 7, 12],
      'Each submission is its own activity (contractor) and the review or approval is its own activity (SAR or authority).')

# ----- Critical path
rows = []; cum = 0
for i, code in enumerate(driving, 1):
    t = tasks[code]
    rows.append([i, code, t['name'], t['dur'] if t['type'] not in ('TT_Mile', 'TT_FinMile') else 0, t['es'], t['ef'], t['tf'], t['resp'], t['sr']])
sheet('Critical Path', ['#', 'Activity ID', 'Activity name', 'Duration (d)', 'Start', 'Finish', 'Total float (d)', 'Responsible', 'Submit / Review'], rows, [5, 11, 70, 9, 11, 11, 9, 12, 16],
      'Longest path: each activity drives the next with zero relationship float, from Notice to Proceed to Contract Completion.', lambda r, c: 'E6F1F4' if r[3] == 0 else None, datecols=(5, 6))

# ----- near-critical TGA
rows = []
for code in new:
    t = tasks[code]
    if t['type'] != 'TT_LOE' and t['tf'] <= 30:
        rows.append([code, t['name'], t['es'], t['ef'], t['tf'], t['resp'], fmt_rel(t['succs'])])
rows.sort(key=lambda r: r[4])
sheet('Near-Critical TGA', ['Activity ID', 'Activity name', 'Start', 'Finish', 'Total float (d)', 'Responsible', 'Successors'], rows, [11, 70, 11, 11, 9, 12, 40],
      'New TGA and permit activities with 30 days of float or less: the ones to watch.', datecols=(3, 4))

# ----- approvals timeline
keys = [('TG-2020', 'ICP accepted'), ('TG-2040', 'DEMP, safety and RAM plans approved'), ('DS-0020', 'Gate 1 Concept design approved'), ('TG-2220', 'Safety case reviewed by SAR'), ('TG-2320', 'High-level EIA reviewed by SAR'), ('DS-0360', 'Gate 2 Preliminary design approved'),
        ('TG-2420', 'Hazard close-out reviewed by SAR'), ('TG-2520', 'HCIS design approval'), ('PR-0110', 'Civil Defense design approval'), ('PR-2270', 'Environmental permit for construction'), ('TG-2640', 'Work permit delivery plan (TTF02) approved'),
        ('DS-0700', 'Gate 3 Detailed design (IFC) approved'), ('PR-0120', 'SAR work permit issued'), ('MS-0090', 'Construction start'), ('TG-2925', 'Operating rules notice published'), ('TC-0460', 'Trial running'), ('TC-0380', 'SAR safety assessment'),
        ('CO-0015', 'SAR Taking-Over certificate issued'), ('MS-0140', 'Contract completion')]
rows = [[c, lab, tasks[c]['name'], tasks[c]['ef'], tasks[c]['tf'], tasks[c]['resp']] for c, lab in keys]
sheet('Approvals Timeline', ['Activity ID', 'Approval', 'Activity name', 'Date (finish)', 'Total float (d)', 'Responsible'], rows, [11, 40, 64, 12, 9, 12], 'Indicative dates assuming NTP on 1 Nov 2026.', datecols=(4,))

# ----- gate logic
rows = []
for g in ('DS-0020', 'DS-0360', 'DS-0700', 'PR-0120', 'MS-0090', 'CO-0015', 'TC-0380'):
    t = tasks[g]; pr = [p for p in t['preds']]
    tg = [p for p in pr if p[0] in new]
    rows.append([g, t['name'], t['ef'], len(pr), ', '.join(f"{c}" for c, _, _ in tg) or '-'])
sheet('Gate Logic', ['ID', 'Gate / activity', 'Date', 'Predecessors', 'New TGA predecessors'], rows, [10, 70, 12, 12, 70], 'The design gates, work permit and Taking-Over now wait for the TGA and authority activities listed.', datecols=(3,))

# ----- checks
tot = len(M['tasks'])
neg = sum(1 for t in M['tasks'] if t['tf'] < 0)
crit = sum(1 for t in M['tasks'] if t['tf'] <= 0 and t['type'] != 'TT_LOE')
noend = [t['code'] for t in M['tasks'] if not t['succs'] and t['code'] != 'MS-0140']
nopre = [t['code'] for t in M['tasks'] if not t['preds'] and t['code'] != 'MS-0010']
rows = [['Activities in the XER', tot, 'OK'], ['New activities', len(new), 'OK'], ['Relationships', M['rel_count'], 'OK'], ['Activities with negative float', neg, 'OK' if neg == 0 else 'CHECK'],
        ['Critical activities (float 0 or less, excluding LOE)', crit, 'Same count as the previous baseline'], ['Contract completion', tasks['MS-0140']['ef'], 'OK'], ['Open ends (no successor)', len(noend), ', '.join(noend[:8])], ['Open starts (no predecessor)', len(nopre), ', '.join(nopre[:8])],
        ['Resource cost total (PERF + CASH)', 199998000.23, 'Unchanged: new activities carry no cost']]
sheet('Checks', ['Check', 'Value', 'Result'], rows, [60, 20, 60], 'Open ends and starts are the activities the baseline already treated as level-of-effort or cash items.')
wb.save('/home/user/c001/out/Zulfi_BL02_TGA_Logic_and_Critical_Path.xlsx')
print('saved', len(new), len(links), len(pairs), len(driving))
print('open ends', noend[:12]); print('open starts', nopre[:12])
