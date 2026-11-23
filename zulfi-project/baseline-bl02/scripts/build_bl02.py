"""Builds the ZULFI-BL02 baseline: adds the TGA process, SAR work permit and authority activities to the Zulfi XER,
links them, separates submittals from reviews, reschedules (CPM) and writes the new XER and analysis files."""
import copy, datetime as dt, json, random, re, string, sys, os
sys.path.insert(0, '/home/user/c001')
from xerlib import parse
import cpm
from bl02_spec import *

SRC = '/home/user/c001/C001/Zulfi_Baseline_Programme.xer'
OUT = '/home/user/c001/out'; os.makedirs(OUT, exist_ok=True)
START = dt.date(2026, 11, 1); FINISH = dt.date(2028, 12, 31)
random.seed(2026)

hdr, T = parse(SRC)
cals, tasks = cpm.load(T)
by = {t.code: t for t in tasks.values()}
orig_rows = {r['task_id']: dict(r) for r in T['TASK']['r']}

def guid():
    return ''.join(random.choice(string.ascii_letters + string.digits + '-_') for _ in range(22))

# ---------------------------------------------------------------- WBS
wbs_rows = T['PROJWBS']['r']
root = [w for w in wbs_rows if not w['parent_wbs_id']][0]
next_wbs = max(int(w['wbs_id']) for w in wbs_rows) + 1
seq0 = max(int(w['seq_num'] or 0) for w in wbs_rows)
wbs_key = {}
tmpl_w = [w for w in wbs_rows if w['parent_wbs_id'] == root['wbs_id']][0]
for k, name in WBS_NEW:
    w = dict(tmpl_w); w['wbs_id'] = str(next_wbs); next_wbs += 1; seq0 += 1
    w['parent_wbs_id'] = root['wbs_id'] if k == '09' else wbs_key['09']
    w['wbs_short_name'] = '09' if k == '09' else k[2:]
    w['wbs_name'] = name; w['seq_num'] = str(seq0); w['guid'] = guid()
    wbs_rows.append(w); wbs_key[k] = w['wbs_id']

# ---------------------------------------------------------------- activity codes (new values and new types)
types = {a['actv_code_type']: a for a in T['ACTVTYPE']['r']}
codeval = {}   # (type name, short_name) -> actv_code_id
for a in T['ACTVCODE']['r']:
    tn = [k for k, v in types.items() if v['actv_code_type_id'] == a['actv_code_type_id']][0]
    codeval[(tn, a['short_name'])] = a['actv_code_id']
next_code = max(int(a['actv_code_id']) for a in T['ACTVCODE']['r']) + 1
def add_value(tn, short, name=None, seq=None):
    global next_code
    if (tn, short) in codeval: return codeval[(tn, short)]
    row = dict(T['ACTVCODE']['r'][0]); row['actv_code_id'] = str(next_code); row['parent_actv_code_id'] = ''
    row['actv_code_type_id'] = types[tn]['actv_code_type_id']; row['actv_code_name'] = name or short; row['short_name'] = short
    row['seq_num'] = str(seq or (sum(1 for k in codeval if k[0] == tn) + 1)); row['color'] = ''
    T['ACTVCODE']['r'].append(row); codeval[(tn, short)] = row['actv_code_id']; next_code += 1
    return row['actv_code_id']
next_type = max(int(a['actv_code_type_id']) for a in T['ACTVTYPE']['r']) + 1
def add_type(name, values):
    global next_type
    row = dict(T['ACTVTYPE']['r'][0]); row['actv_code_type_id'] = str(next_type); row['actv_code_type'] = name
    row['seq_num'] = str(len(T['ACTVTYPE']['r']) + 1); row['actv_short_len'] = '20'
    T['ACTVTYPE']['r'].append(row); types[name] = row; next_type += 1
    for i, v in enumerate(values, 1): add_value(name, v[:20], v, i)
add_type('TGA Process', ['ICP and Safety Planning', 'Design Safety Assurance', 'Authority Design Approvals', 'SAR Work Permit and Possession', 'Construction Safety Assurance', 'Verification and Readiness', 'Not TGA process'])
add_type('Submit / Review', ['Preparation', 'Submission', 'Review / Approval', 'Not applicable'])
add_type('Duration Basis', ['Baseline', 'Contract (C)', 'Work Permit Handbook (H)', 'SAR procedure (S)', 'Baseline assumption (B)', 'To be confirmed (T)'])
add_value('Responsibility', 'ICP', 'Independent Competent Person (ICP)')
add_value('Discipline', 'TGA & Safety Assuran', 'TGA and Safety Assurance')
add_value('Discipline', 'SAR Work Permit', 'SAR Work Permit and Possession')
add_value('Critical Driver', 'TGA / permit chain', 'TGA / permit chain')

# ---------------------------------------------------------------- new tasks
next_task = max(int(t.id) for t in tasks.values()) + 1
tmpl_row = dict(orig_rows[by['PR-0270'].id])
ta_by_task = {}
for r in T['TASKACTV']['r']: ta_by_task.setdefault(r['task_id'], {})[r['actv_code_type_id']] = r['actv_code_id']
tmpl_codes = dict(ta_by_task[by['PR-0270'].id])
TGA_LEAF = {'0901': 'ICP and Safety Planning', '0902': 'Design Safety Assurance', '0903': 'Authority Design Approvals', '0904': 'SAR Work Permit and Possession', '0905': 'Construction Safety Assurance', '0906': 'Verification and Readiness'}
BASIS = {'C': 'Contract (C)', 'H': 'Work Permit Handbook (H)', 'S': 'SAR procedure (S)', 'B': 'Baseline assumption (B)', 'T': 'To be confirmed (T)'}
new_codes = {}          # task code -> dict of code overrides {type name: short}

def submit_review(name):
    n = name.lower()
    if re.search(r'submission|submit|request package|application', n): return 'Submission'
    if re.search(r'review|approval|approve|acceptance|issue', n): return 'Review / Approval'
    if re.search(r'prepare|preparation|development|package', n): return 'Preparation'
    return 'Not applicable'

rel_rows = []
def add_task(spec):
    global next_task
    code, name, dur, cal, resp, leaf, preds, basis, note = spec
    r = dict(tmpl_row)
    r['task_id'] = str(next_task); next_task += 1
    r['task_code'] = code; r['task_name'] = name; r['wbs_id'] = wbs_key[leaf]; r['clndr_id'] = cal
    r['task_type'] = 'TT_LOE' if (code == 'TG-0730') else 'TT_Task'
    r['target_drtn_hr_cnt'] = str(dur * 8); r['remain_drtn_hr_cnt'] = str(dur * 8)
    r['cstr_type'] = ''; r['cstr_date'] = ''; r['guid'] = guid(); r['rsrc_id'] = ''
    r['status_code'] = 'TK_NotStart'; r['phys_complete_pct'] = '0'; r['complete_pct_type'] = 'CP_Drtn'
    r['create_date'] = r['update_date'] = '2026-11-23 09:00'
    T['TASK']['r'].append(r)
    t = cpm.Task(); t.id = r['task_id']; t.code = code; t.name = name; t.dur = dur; t.cal = cals[cal]; t.ttype = r['task_type']
    t.cstr = ''; t.cstr_date = None; t.preds = []; t.succs = []; t.wbs = r['wbs_id']; t.row = r
    tasks[t.id] = t; by[code] = t
    new_codes[code] = dict(resp=resp, leaf=leaf, basis=basis, note=note)
    return t

def link(p, s, typ='FS', lag=0):
    rel = (p, s, typ, lag); s.preds.append(rel); p.succs.append(rel)
def unlink(p, s):
    s.preds = [x for x in s.preds if x[0] is not p]; p.succs = [x for x in p.succs if x[1] is not s]

pending = []
for spec in ACT:
    t = add_task(spec); pending.append((t, spec[6]))
for t, preds in pending:
    if isinstance(preds, str) and preds.startswith('INSERT:'):
        tgt = by[preds.split(':')[1]]
        for (p, _, typ, lag) in list(tgt.preds):
            link(p, t, typ, lag); unlink(p, tgt)
        link(t, tgt, 'FS', 0)
    else:
        for (pc, typ, lag) in preds: link(by[pc], t, typ, lag)
for (pc, sc, typ, lag) in LINKS: link(by[pc], by[sc], typ, lag)
for code, nm in RENAME.items(): by[code].name = nm; by[code].row['task_name'] = nm
for (code, op, arg) in LOGIC_CHANGES:
    if op == 'remove_pred': unlink(by[arg], by[code])
    elif op == 'add_pred': link(by[arg[0]], by[code], arg[1], arg[2])

# LOE TG-0730: kept out of the network calculation, dates set after scheduling
loe = by['TG-0730']
loe_saved = (list(loe.preds), list(loe.succs))
for (p, _, _, _) in list(loe.preds): unlink(p, loe)
for (_, s, _, _) in list(loe.succs): unlink(loe, s)

order = cpm.schedule(tasks, START, FINISH, 'pred')
neg = [t for t in order if t.tf is not None and t.tf < 0]
print('tasks', len(tasks), 'new', len(ACT), 'negative-float tasks', len(neg))
for t in neg[:15]: print('  NEG', t.code, t.tf, t.name[:60])
mf = by['MS-0140']; print('completion early', mf.ef, 'late', mf.lf, 'TF', mf.tf)
loe.es = by['MS-0090'].es; loe.ef = by['MS-0120'].ef; loe.ls = loe.es; loe.lf = loe.ef; loe.tf = 0
loe.dur = loe.cal.count(loe.es, loe.ef) + 1

# ---------------------------------------------------------------- driving path and float classes
DP = cpm.driving_path(tasks, 'MS-0140')
DP_codes = [t.code for t in DP]

if __name__ == '__main__' and os.environ.get('SHOW'):
    for c in os.environ['SHOW'].split(','):
        t = by[c]; print(f"{c:8} {t.dur:>3}d {t.es} -> {t.ef} | LS {t.ls} LF {t.lf} TF {t.tf} | {t.name[:55]}")

if __name__ == '__main__' and os.environ.get('NEW'):
    for spec in ACT:
        t = by[spec[0]]; print(f"{t.code:8} {t.dur:>3}d {t.es} -> {t.ef} TF {t.tf:>4} | {t.name[:60]}")
    print('--- driving path')
    for t in cpm.driving_path(tasks, 'MS-0140'): print(f"{t.code:8} {t.dur:>3}d {t.es} -> {t.ef} TF {t.tf:>4} | {t.name[:62]}")
