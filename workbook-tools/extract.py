"""Read the Delivery Plan + weekly workbook and write a normalized JSON (projects, monthly, kpis, delivery, glossary, findings)."""
import sys, json, re, datetime, openpyxl
dp, wk, out = sys.argv[1], sys.argv[2], sys.argv[3]
V = openpyxl.load_workbook(dp, data_only=True); F = openpyxl.load_workbook(dp)
W = openpyxl.load_workbook(wk, data_only=True)['Weekly Report Updates']

def d(v):
    if isinstance(v, datetime.datetime):
        return None if v.year < 1901 else v.strftime('%Y-%m-%d')
    if isinstance(v, datetime.time): return None
    return v
def num(f, v):
    """keep a hand-typed arithmetic formula (=1+2) as is, otherwise the value"""
    if isinstance(f, str) and f.startswith('='): return f
    return v

sp, spf = V['Spending Plan'], F['Spending Plan']
npd = V['NSR Project Data']; kpd = V['KPI Projects_Data']; ab = V['Abbreviation']
nsr = {str(npd.cell(r, 6).value): r for r in range(3, 24)}
kcode = {str(kpd.cell(r, 1).value): kpd.cell(r, 3).value for r in range(3, 24)}
abbr = {str(ab.cell(r, 1).value).strip(): str(ab.cell(r, 2).value) for r in range(2, 23) if ab.cell(r, 1).value}

def clean_name(s):
    s = re.sub(r'\s+', ' ', str(s or '')).strip()
    s = re.sub(r'\s*-?\s*PO\s*#\s*\d+\s*$', '', s).strip()
    return s.rstrip(' .')

projects, monthly = [], []
for r0 in range(4, 256, 12):
    code = str(sp.cell(r0, 5).value)
    short = str(sp.cell(r0, 6).value).strip()
    nr = nsr.get(code)
    start = d(sp.cell(r0, 15).value) or next((d(sp.cell(r, 15).value) for r in range(r0, r0 + 12) if d(sp.cell(r, 15).value)), None)
    projects.append(dict(
        code=code, short=short, name=clean_name(abbr.get(short, short)),
        program=sp.cell(r0, 4).value, section=npd.cell(nr, 4).value if nr else None,
        fund=sp.cell(r0, 3).value, po=npd.cell(nr, 5).value if nr else None, kpi=kcode.get(code),
        phase=sp.cell(r0, 17).value, start=start, end=d(sp.cell(r0, 16).value),
        full_cost=sp.cell(r0, 7).value, cv=sp.cell(r0, 8).value,
        wc_prev=num(spf.cell(r0, 9).value, sp.cell(r0, 9).value),
        paid=num(spf.cell(r0, 12).value, sp.cell(r0, 12).value),
        wcode='6203' if code == '6203A' else code,
        remarks=(npd.cell(nr, 19).value or None) if nr else None, src_row=r0))
    for r in range(r0, r0 + 12):
        def cell(c):
            f, v = spf.cell(r, c).value, sp.cell(r, c).value
            if isinstance(f, str) and f.startswith('='):
                if 'Actual Spend (Incr)4' in f: return '=ACT'
                if re.fullmatch(r'=[\d\.\+\-\*/\(\) ]+', f): return f
            return v
        monthly.append(dict(code=code, month=d(sp.cell(r, 2).value), budget=cell(19), v0=cell(20), v2=cell(21),
                            actual=cell(22), fcst=cell(23), invoice=sp.cell(r, 24).value, milestone=sp.cell(r, 30).value,
                            remarks=sp.cell(r, 34).value, src_row=r))

# weekly-only projects (not in the Delivery Plan)
h = [W.cell(1, c).value for c in range(1, W.max_column + 1)]
def wv(r, name): return W.cell(r, h.index(name) + 1).value
have = {p['wcode'] for p in projects}
for r in range(2, W.max_row + 1):
    c = wv(r, 'Project Code')
    if c and str(c) not in have:
        projects.append(dict(code=str(c), short='NCAR CCTV', name=clean_name(wv(r, 'Project Name')).replace('- Weekly Dashboard', '').strip(' -'),
            program='NSR', section=None, fund=wv(r, 'Budget Type'), po=wv(r, '(Con) PO Number'), kpi=None, phase='Execution',
            start=d(wv(r, 'Start Date \nBaseline')), end=d(wv(r, 'End Date\nBaseline')), full_cost=wv(r, 'Full Budget'),
            cv=wv(r, 'Contract Value'), wc_prev=None, paid=wv(r, 'Paid Amount'), wcode=str(c),
            remarks='Added from the weekly report: not in the 2026 Delivery Plan (no monthly plan yet).', src_row=None))

ks = V['KPI_Summary']
manual = {}
for r in range(23, 34):
    manual[kpd.cell(r, 3).value] = kpd.cell(r, 7).value
kpis = []
for r in range(2, 17):
    code = ks.cell(r, 1).value
    kpis.append(dict(code=code, persp=ks.cell(r, 3).value.strip(), name=ks.cell(r, 4).value.strip(), weight=ks.cell(r, 5).value,
                     fy=ks.cell(r, 6).value, fy_v2=ks.cell(r, 7).value, ytd=ks.cell(r, 9).value, ytd_v2=ks.cell(r, 10).value,
                     act=ks.cell(r, 11).value, result=ks.cell(r, 14).value, remarks=ks.cell(r, 16).value,
                     spend=code in (7, 8)))
dk = V['Delivery KPI']
delivery = [dict(code=str(dk.cell(r, 4).value), target=d(dk.cell(r, 9).value), budget=dk.cell(r, 8).value, name=dk.cell(r, 5).value) for r in range(2, 6)]
gloss = [(str(ab.cell(r, 5).value).strip(), str(ab.cell(r, 6).value).strip()) for r in range(2, 35) if ab.cell(r, 5).value]
# original cached results, for the self-check
orig = dict(kpi_total=ks.cell(17, 14).value,
            kpd={str(kpd.cell(r, 1).value): [kpd.cell(r, c).value for c in (7, 8, 10, 11, 12, 13, 17, 18)] for r in range(3, 24)})
json.dump(dict(projects=projects, monthly=monthly, kpis=kpis, delivery=delivery, glossary=gloss, orig=orig), open(out, 'w'), indent=1, default=str)
print(len(projects), 'projects', len(monthly), 'monthly rows', len(kpis), 'kpis')
