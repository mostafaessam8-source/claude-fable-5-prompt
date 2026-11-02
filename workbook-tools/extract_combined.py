"""Read the input cells of an existing combined "EPBU NSR Projects Database" workbook and write the model JSON that
build.py takes, so the plan sheets can be rebuilt (e.g. after a column change) without losing what was typed.
Only input (blue) cells are read; calculated and weekly columns are rebuilt by build.py.

usage: extract_combined.py combined.xlsx model.json"""
import sys, json, re, datetime, openpyxl

src, out = sys.argv[1], sys.argv[2]
F = openpyxl.load_workbook(src)                     # formulas
V = openpyxl.load_workbook(src, data_only=True)     # cached values


def d(v):
    if isinstance(v, datetime.datetime): return None if v.year < 1901 else v.strftime("%Y-%m-%d")
    if isinstance(v, datetime.time): return None
    return v


def hdr(ws, row=4):
    return {str(c.value).strip(): c.column for c in ws[row] if c.value is not None}


def rows(name, key="Code"):
    ws, wv = F[name], V[name]
    h = hdr(ws); out = []
    for r in range(5, ws.max_row + 1):
        if ws.cell(r, h[key]).value in (None, ""): continue
        out.append((r, h, ws, wv))
    return out


# ---------------------------------------------------------------- Projects (input columns)
PIN = {"Code": "code", "Short Name": "short", "Project Name": "name", "Program": "program", "Section": "section", "Fund Type": "fund",
       "PO Number": "po", "KPI Code": "kpi", "Project Phase": "phase", "Start Date": "start", "End Date": "end", "Full Cost (SAR)": "full_cost",
       "Contract Value (SAR)": "cv", "WC Previous Years (SAR)": "wc_prev", "Paid from CV as per ERP (SAR)": "paid",
       "Weekly Report Code": "wcode", "Remarks / Concern": "remarks", "PR Number": "pr", "Contractor": "contractor",
       "Owner (BU)": "owner", "Budget (PMO) (SAR)": "budget_pmo", "Scope": "scope"}
projects = []
for r, h, ws, wv in rows("Projects"):
    p = {}
    for head, k in PIN.items():
        c = h.get(head)
        f = ws.cell(r, c).value if c else None
        v = wv.cell(r, c).value if c else None
        if isinstance(f, str) and f.startswith("=") and re.fullmatch(r"=[\d\.\+\-\*/\(\) ]+", f): v = f   # hand-typed sum kept
        p[k] = d(v)
    p["code"] = str(p["code"]); p["wcode"] = None if p["wcode"] is None else str(p["wcode"])
    projects.append(p)

# ---------------------------------------------------------------- Monthly Plan (input columns)
MIN = {"Budget Plan (Incr)": "budget", "Rev Spend Plan (Incr)": "rev", "Actual Spend (Incr)": "actual", "Contractor Forecast (Incr)": "fcst",
       "Invoice-related Activities": "invoice", "Milestones": "milestone", "Remarks / Concern": "remarks"}
monthly = []
for r, h, ws, wv in rows("Monthly Plan"):
    act_col = openpyxl.utils.get_column_letter(h["Actual Spend (Incr)"])
    m = {"code": str(ws.cell(r, h["Code"]).value), "month": d(wv.cell(r, h["Month"]).value)}
    for head, k in MIN.items():
        if head not in h: continue
        c = h[head]; f = ws.cell(r, c).value; v = wv.cell(r, c).value
        if isinstance(f, str) and f.startswith("="):
            if re.fullmatch(r"=\$?%s\$?%d" % (act_col, r), f.strip()): v = "=ACT"           # takes the month's actual
            elif re.fullmatch(r"=[\d\.\+\-\*/\(\) ]+", f): v = f                              # hand-typed arithmetic
        m[k] = d(v)
    monthly.append(m)

# ---------------------------------------------------------------- KPI Scorecard
kpis = []
for r, h, ws, wv in rows("KPI Scorecard", "KPI Code"):
    g = lambda head: wv.cell(r, h[head]).value if head in h else None
    kpis.append(dict(code=g("KPI Code"), persp=g("Perspective"), name=g("Objective / KPI"), weight=g("KPI Weight"),
                     fy=g("FY Target / Plan"), ytd=g("YTD Target / Plan"), act=g("YTD Actual"), remarks=g("Remarks"),
                     linked=g("Linked Project"), spend=g("Measured From") == "Monthly Plan"))

# ---------------------------------------------------------------- Delivery KPI
delivery = []
for r, h, ws, wv in rows("Delivery KPI", "Project Code"):
    delivery.append(dict(code=str(wv.cell(r, h["Project Code"]).value), target=d(wv.cell(r, h["Target Completion Date"]).value),
                         remarks=wv.cell(r, h["Remarks"]).value))

# ---------------------------------------------------------------- Spend Risk
risk = []
if "Spend Risk" in F.sheetnames:
    for r, h, ws, wv in rows("Spend Risk"):
        g = lambda head: wv.cell(r, h[head]).value if head in h else None
        risk.append(dict(code=str(g("Code")), date=d(g("Status Date")), inproc=g("In-Process (SAR)"), geo=g("At Risk · Geopolitical (SAR)"),
                         other=g("At Risk · Operational (SAR)"), cause=g("Root Cause"), desc=g("Risk Description"), action=g("Required Action"),
                         reprof=g("Budget Reprofiling")))

# ---------------------------------------------------------------- Settings, lists, glossary
st = V["Settings"]
settings = dict(year=st["B5"].value, cutoff=d(st["B6"].value), folder=st["B8"].value, status=st["B9"].value)
lists = {}
for t in ("List_FundType", "List_Program", "List_Phase", "List_Section", "List_Month"):
    ref = F["Settings"].tables[t].ref
    a, b = ref.split(":"); col = re.match(r"[A-Z]+", a).group(0); r0, r1 = int(a[len(col):]), int(b[len(col):])
    lists[t] = [d(st["%s%d" % (col, r)].value) for r in range(r0 + 1, r1 + 1) if st["%s%d" % (col, r)].value is not None]
gl = F["Settings"].tables["Glossary"].ref
g1 = int(gl.split(":")[1][1:])
glossary = [(st["N%d" % r].value, st["O%d" % r].value) for r in range(13, g1 + 1) if st["N%d" % r].value]

# ---------------------------------------------------------------- Review Notes (findings)
rn = V["Review Notes"]; findings = []
for r in range(5, rn.max_row + 1):
    if rn.cell(r, 1).value is None: continue
    findings.append([rn.cell(r, c).value for c in range(2, 7)])

json.dump(dict(projects=projects, monthly=monthly, kpis=kpis, delivery=delivery, glossary=glossary, findings=findings,
               settings=settings, lists=lists, risk=risk), open(out, "w"), indent=1, default=str)
print(len(projects), "projects", len(monthly), "monthly rows", len(kpis), "kpis", len(delivery), "delivery", len(glossary), "glossary",
      len(findings), "findings", settings)
