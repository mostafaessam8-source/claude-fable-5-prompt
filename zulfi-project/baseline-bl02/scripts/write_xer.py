"""Second half of the BL02 build: writes the XER and the analysis json. Imported after build_bl02 (runs the model)."""
import os, re, json, datetime as dt
import build_bl02 as M
from build_bl02 import *   # model objects: T, tasks, by, cals, order, DP, DP_codes, new_codes, wbs_key, types, codeval, add_value ...

D = dt.date
fmt = lambda d, h: f"{d.isoformat()} {h}"
all_tasks = list(tasks.values())
task_order = [t for t in all_tasks]

# ---------------------------------------------------------------- code classification helpers
def sr(name):
    n = name.lower()
    if re.search(r'submission|submit|request package|application', n): return 'Submission'
    if re.search(r'review|approval|approve|acceptance|issue|booking', n): return 'Review / Approval'
    if re.search(r'prepare|preparation|development|package', n): return 'Preparation'
    return 'Not applicable'
def floatclass(t, old):
    if old in ('LOE / Cash',): return old
    if t.tf is None: return old
    if t.tf <= 0: return 'Critical (0 d)'
    if t.tf <= 30: return 'Near-critical (1-30 d)'
    if t.tf <= 90: return 'Float 31-90 d'
    return 'Float > 90 d'
tga_existing = {
 'PR-0110': 'Authority Design Approvals', 'PR-0190': 'Authority Design Approvals', 'PR-0270': 'Authority Design Approvals', 'PR-2270': 'Authority Design Approvals', 'MS-0075': 'Authority Design Approvals',
 'PR-0120': 'SAR Work Permit and Possession', 'MS-0070': 'SAR Work Permit and Possession', 'PR-0195': 'SAR Work Permit and Possession', 'PR-0196': 'SAR Work Permit and Possession',
 'TC-0380': 'Verification and Readiness', 'CO-0015': 'Verification and Readiness', 'TC-0020': 'Verification and Readiness', 'TC-0140': 'Verification and Readiness', 'TC-0110': 'Verification and Readiness', 'TC-0210': 'Verification and Readiness', 'TC-0230': 'Verification and Readiness', 'TC-0460': 'Verification and Readiness', 'TC-0370': 'Verification and Readiness',
}
LEAFNAME = {'0901': 'ICP and Safety Planning', '0902': 'Design Safety Assurance', '0903': 'Authority Design Approvals', '0904': 'SAR Work Permit and Possession', '0905': 'Construction Safety Assurance', '0906': 'Verification and Readiness'}

id2code = {v: k[1] for k, v in codeval.items()}   # not used directly
tname = {v['actv_code_type_id']: k for k, v in types.items()}
tid = {k: v['actv_code_type_id'] for k, v in types.items()}

# existing task -> code dict
code_of = {}
for r in T['TASKACTV']['r']:
    code_of.setdefault(r['task_id'], {})[tname[r['actv_code_type_id']]] = r['actv_code_id']
rev = {}
for (tn, short), cid in codeval.items(): rev[cid] = (tn, short)

def setcode(tk_id, tn, short):
    code_of.setdefault(tk_id, {})[tn] = codeval[(tn, short)] if (tn, short) in codeval else add_value(tn, short)

for t in all_tasks:
    isnew = t.code in new_codes
    if isnew:
        info = new_codes[t.code]; leaf = info['leaf']
        base = dict(code_of[by['PR-0270'].id])
        code_of[t.id] = base
        stage = {'0901': 'Preliminaries', '0902': 'Design', '0903': 'Preliminaries', '0904': 'Preliminaries', '0905': 'Construction', '0906': 'Testing & Commission'}[leaf]
        setcode(t.id, 'Stage', stage)
        setcode(t.id, 'BOQ Ref', 'N/A'); setcode(t.id, 'Cost Component', 'No cost'); setcode(t.id, 'Payment Basis', 'None')
        setcode(t.id, 'Responsibility', {'Contractor': 'Contractor', 'SAR': 'SAR', 'Authority': 'Authority', 'ICP': 'ICP'}[info['resp']])
        disc = 'SAR Work Permit' if leaf == '0904' else ('Authorities & Permit' if leaf == '0903' or re.search(r'Inspection Request', t.name) else 'TGA & Safety Assuran')
        setcode(t.id, 'Discipline', disc)
        ds = 'Studies & Approvals'
        if re.match(r'TG-0(1|2)', t.code) and leaf in ('0902',): ds = {'TG-01': 'Concept', 'TG-02': 'Preliminary', 'TG-03': 'Preliminary', 'TG-04': 'Detailed & IFC'}.get(t.code[:5], 'Studies & Approvals')
        if t.code.startswith(('TG-05', 'TG-06', 'TG-07')): ds = 'Detailed & IFC' if t.code.startswith(('TG-05', 'TG-06', 'TG-07')) and leaf in ('0903', '0904', '0905') else ds
        setcode(t.id, 'Design Stage', ds)
        setcode(t.id, 'Risk Flag', 'SAR dependency' if info['resp'] == 'SAR' else 'Authority dependency')
        setcode(t.id, 'Critical Driver', 'TGA / permit chain')
        setcode(t.id, 'Work Zone', 'General'); setcode(t.id, 'Crew Size Class', 'No site crew')
        setcode(t.id, 'Procurement Step', 'N/A'); setcode(t.id, 'Milestone Type', 'N/A')
        setcode(t.id, 'TGA Process', LEAFNAME[leaf])
        setcode(t.id, 'Duration Basis', {'C': 'Contract (C)', 'H': 'Work Permit Handbook (H)', 'S': 'SAR procedure (S)', 'B': 'Baseline assumption (B)', 'T': 'To be confirmed (T)'}[info['basis']])
    else:
        setcode(t.id, 'TGA Process', tga_existing.get(t.code, 'Not TGA process'))
        setcode(t.id, 'Duration Basis', 'Baseline')
    setcode(t.id, 'Submit / Review', sr(t.name) if t.ttype not in ('TT_Mile', 'TT_FinMile') and t.ttype != 'TT_LOE' else 'Not applicable')
    # recomputed classification codes
    old_pc = rev[code_of[t.id]['Path Class']][1] if 'Path Class' in code_of[t.id] else 'Float > 90 d'
    setcode(t.id, 'Path Class', floatclass(t, old_pc))
    setcode(t.id, 'Start Month', t.es.strftime('%Y-%m')); setcode(t.id, 'Finish Month', t.ef.strftime('%Y-%m'))
    q = (t.es.month - 1) // 3 + 1
    setcode(t.id, 'Start Quarter', f"{t.es.year}-Q{q}")
    if t.code in DP_codes: setcode(t.id, 'Critical Driver', 'Longest path')
    elif not isnew and rev[code_of[t.id]['Critical Driver']][1] == 'Longest path': setcode(t.id, 'Critical Driver', 'Design & approvals gate')

# ---------------------------------------------------------------- TASK rows
old_dates = {}
dpi = {c: i for i, c in enumerate(DP_codes)}
for t in all_tasks:
    r = t.row; old = (r.get('early_start_date'), r.get('early_end_date'))
    old_dates[t.id] = old
    if t.ttype == 'TT_Mile': es = fmt(t.es, '08:00'); ef = fmt(t.ef, '08:00'); ls = fmt(t.ls, '08:00'); lf = fmt(t.lf, '08:00')
    elif t.ttype == 'TT_FinMile': es = ef = fmt(t.ef, '16:00'); ls = lf = fmt(t.lf, '16:00')
    else: es = fmt(t.es, '08:00'); ef = fmt(t.ef, '16:00'); ls = fmt(t.ls, '08:00'); lf = fmt(t.lf, '16:00')
    if t.code == 'TG-0730':
        r['target_drtn_hr_cnt'] = r['remain_drtn_hr_cnt'] = str(t.dur * 8)
    if t.cstr == 'CS_MEO' and t.cstr_date: ef = fmt(t.ef, '16:00')
    r['early_start_date'] = es; r['early_end_date'] = ef; r['late_start_date'] = ls; r['late_end_date'] = lf
    r['target_start_date'] = es; r['target_end_date'] = ef; r['restart_date'] = es; r['reend_date'] = ef
    r['rem_late_start_date'] = ls; r['rem_late_end_date'] = lf
    r['total_float_hr_cnt'] = str(int(t.tf) * 8); r['free_float_hr_cnt'] = '0'
    r['driving_path_flag'] = 'Y' if t.code in dpi else 'N'
    r['float_path'] = '1' if t.code in dpi else ''
    r['float_path_order'] = str(dpi[t.code]) if t.code in dpi else ''
    r['update_date'] = '2026-11-23 09:00'
    r['task_name'] = t.name

# ---------------------------------------------------------------- relationships
rel_old = {}
for r in T['TASKPRED']['r']: rel_old[(r['pred_task_id'], r['task_id'], r['pred_type'][3:], int(round(float(r['lag_hr_cnt'] or 0) / 8)))] = r
loe = by['TG-0730']
rels = []
for t in all_tasks:
    for (p, s, typ, lag) in t.preds: rels.append((p.id, s.id, typ, lag))
for (p, s, typ, lag) in loe_saved[0]: rels.append((p.id, loe.id, typ, lag))
for (p, s, typ, lag) in loe_saved[1]: rels.append((loe.id, s.id, typ, lag))
for (a, b, typ, lag) in [(by['MS-0090'].id, loe.id, 'SS', 0), (loe.id, by['MS-0120'].id, 'FF', 0)]:
    if (a, b, typ, lag) not in rels: rels.append((a, b, typ, lag))
rels = sorted(set(rels), key=lambda x: (int(x[1]), int(x[0])))
next_rel = max(int(r['task_pred_id']) for r in T['TASKPRED']['r']) + 1
newrows = []
tmpl_rel = T['TASKPRED']['r'][0]
for (p, s, typ, lag) in rels:
    if (p, s, typ, lag) in rel_old: newrows.append(rel_old[(p, s, typ, lag)])
    else:
        r = dict(tmpl_rel); r['task_pred_id'] = str(next_rel); next_rel += 1
        r['task_id'] = s; r['pred_task_id'] = p; r['pred_type'] = 'PR_' + typ; r['lag_hr_cnt'] = str(lag * 8)
        newrows.append(r)
T['TASKPRED']['r'] = newrows

# ---------------------------------------------------------------- TASKACTV rows
rows = []
for t in all_tasks:
    for tn, cid in code_of[t.id].items():
        rows.append({'task_id': t.id, 'actv_code_type_id': tid[tn], 'actv_code_id': cid, 'proj_id': '1000'})
T['TASKACTV']['r'] = rows

# ---------------------------------------------------------------- TASKRSRC dates follow the task dates
tkmap = {t.id: t for t in all_tasks}
for r in T['TASKRSRC']['r']:
    t = tkmap[r['task_id']]
    es = t.row['early_start_date']; ef = t.row['early_end_date']
    r['target_start_date'] = es; r['target_end_date'] = ef; r['rem_late_start_date'] = t.row['late_start_date']; r['rem_late_end_date'] = t.row['late_end_date']

# ---------------------------------------------------------------- project and header
P = T['PROJECT']['r'][0]
P['proj_short_name'] = 'ZULFI-BL02'
P['last_recalc_date'] = '2026-11-01 00:00'
root_w = [w for w in T['PROJWBS']['r'] if not w['parent_wbs_id']][0]
root_w['wbs_short_name'] = 'ZULFI-BL02'; root_w['wbs_name'] = 'Zulfi Passenger Railway Station - Baseline Programme (Revision 01: TGA Process and SAR Permits)'
for w in T['PROJWBS']['r']:
    if w['wbs_short_name'] == 'ZULFI-BL01': w['wbs_short_name'] = 'ZULFI-BL02'
T['TASK']['r'] = [t.row for t in all_tasks]

hdr_new = M.hdr.replace('2026-10-22', '2026-11-23')
lines = [hdr_new]
for name, tb in T.items():
    lines.append('%T\t' + name); lines.append('%F\t' + '\t'.join(tb['f']))
    for r in tb['r']: lines.append('%R\t' + '\t'.join(str(r.get(f, '')) for f in tb['f']))
lines.append('%E')
OUTP = '/home/user/c001/out/Zulfi_Baseline_Programme_BL02_TGA.xer'
open(OUTP, 'wb').write(('\r\n'.join(lines) + '\r\n').encode('cp1252', errors='replace'))
print('XER written', OUTP, len(all_tasks), 'tasks', len(newrows), 'relationships', len(rows), 'code rows')

rev = {cid: k for k, cid in codeval.items()}
# ---------------------------------------------------------------- analysis json for reports
def tinfo(t):
    return dict(code=t.code, name=t.name, dur=t.dur, es=t.es.isoformat(), ef=t.ef.isoformat(), ls=t.ls.isoformat(), lf=t.lf.isoformat(), tf=t.tf, type=t.ttype,
                wbs=t.wbs, resp=rev[code_of[t.id]['Responsibility']][1], tga=rev[code_of[t.id]['TGA Process']][1], sr=rev[code_of[t.id]['Submit / Review']][1], basis=rev[code_of[t.id]['Duration Basis']][1],
                preds=[(p.code, typ, lag) for (p, _, typ, lag) in t.preds], succs=[(s.code, typ, lag) for (_, s, typ, lag) in t.succs])
info = dict(tasks=[tinfo(t) for t in all_tasks], driving=DP_codes, new=[s[0] for s in ACT], loe=dict(es=loe.es.isoformat(), ef=loe.ef.isoformat()),
            notes={s[0]: s[8] for s in ACT}, wbs={k: v for k, v in wbs_key.items()}, rel_count=len(newrows))
# LOE links for info
for x in info['tasks']:
    if x['code'] == 'TG-0730':
        x['preds'] = [('MS-0090', 'SS', 0)]; x['succs'] = [('MS-0120', 'FF', 0)]
json.dump(info, open('/home/user/c001/out/bl02_model.json', 'w'), indent=1)
