import datetime as dt, collections
from xerlib import parse
D = lambda x: dt.datetime.strptime(x, '%Y-%m-%d %H:%M').date()
def revision_log():
    h0, T0 = parse('/home/user/c001/C001/Zulfi_Baseline_Programme.xer'); h1, T1 = parse('/home/user/c001/out/Zulfi_Baseline_Programme_BL02_TGA.xer')
    a = {t['task_code']: t for t in T0['TASK']['r']}; b = {t['task_code']: t for t in T1['TASK']['r']}
    why = {'PR-0110': 'Detailed design submission (TG-0530) added before the Civil Defense review', 'PR-0270': 'Detailed EIA (TG-0330) now precedes the permit application', 'PR-2270': 'Follows the permit application', 'MS-0075': 'Follows the environmental permit',
           'PR-0195': 'Possession request package (TG-0650) added before the SAR booking', 'PR-0196': 'Possession request package (TG-0660) added before the SAR booking', 'CN-1730': 'Follows the possession booking'}
    rows = []
    for c in a:
        if (a[c]['early_start_date'], a[c]['early_end_date']) != (b[c]['early_start_date'], b[c]['early_end_date']):
            reason = why.get(c) or ('Inspection request submission added before the inspection' if c.startswith('TC-') and any(k in a[c]['task_name'] for k in ('Inspection', 'Authority')) else 'Follows an inspection that now starts after its request submission')
            rows.append([c, a[c]['task_name'], a[c]['early_start_date'][:10], a[c]['early_end_date'][:10], b[c]['early_start_date'][:10], b[c]['early_end_date'][:10], int(float(b[c]['total_float_hr_cnt']) / 8), reason])
    return rows
def quarterly_progress(path):
    h, T = parse(path); rs = {r['rsrc_id']: r['rsrc_short_name'] for r in T['RSRC']['r']}; perf = collections.defaultdict(float)
    for r in T['TASKRSRC']['r']:
        if rs[r['rsrc_id']] != 'PERF': continue
        c = float(r['target_cost'] or 0)
        if not c: continue
        s, e = D(r['target_start_date']), D(r['target_end_date']); n = (e - s).days + 1
        for i in range(n):
            d = s + dt.timedelta(days=i); perf[(d.year - 2026) * 12 + d.month - 10] += c / n
    out = []
    for i, (a, b) in enumerate([(1, 3), (4, 6), (7, 9), (10, 12), (13, 15), (16, 18), (19, 21), (22, 24), (25, 26)], 1):
        out.append((f'Q{i}', a, b, round(sum(perf.get(m, 0) for m in range(a, b + 1)) / 1e6, 2)))
    return out
def phase_values():
    h, T = parse('/home/user/c001/out/Zulfi_Baseline_Programme_BL02_TGA.xer')
    types = {a['actv_code_type_id']: a['actv_code_type'] for a in T['ACTVTYPE']['r']}; codes = {a['actv_code_id']: a['short_name'] for a in T['ACTVCODE']['r']}
    ta = {}
    for r in T['TASKACTV']['r']: ta.setdefault(r['task_id'], {})[types[r['actv_code_type_id']]] = codes[r['actv_code_id']]
    rs = {r['rsrc_id']: r['rsrc_short_name'] for r in T['RSRC']['r']}; tot = collections.defaultdict(float)
    for r in T['TASKRSRC']['r']:
        if rs[r['rsrc_id']] == 'PERF': tot[ta[r['task_id']]['Contract Phase']] += float(r['target_cost'] or 0)
    return dict(tot)
if __name__ == '__main__':
    print(len(revision_log())); print(quarterly_progress('/home/user/c001/out/Zulfi_Baseline_Programme_BL02_TGA.xer')); print(phase_values())
