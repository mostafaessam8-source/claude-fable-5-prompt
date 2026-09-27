"""Dynamic Excel dashboard: every KPI is a live Excel formula.

Sheets
    Dashboard   - input cells (Data Date, filters, lookahead weeks, delay tolerance) and KPIs,
                  phase / discipline / status tables and native Excel charts, all formulas.
    Data        - one row per activity (source values from the XER) plus formula columns:
                  planned fraction (baseline calendar working-day table), filter flag,
                  finish variance, delayed and lookahead flags.
    S-Curve     - monthly S-curve values computed by the application (reference, static).
    Calendars   - baseline calendars and their cumulative working-day table (named range CalCum).
    Lists       - dropdown values for the filters.
    Read Me     - which cells to edit, and the formulas.

Changing the Data Date or any filter recalculates every KPI, table and chart in Excel.
"""
from __future__ import annotations

from datetime import datetime

from openpyxl import Workbook
from openpyxl.chart import BarChart, DoughnutChart, LineChart, Reference
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation

from .. import APP_NAME, __version__
from . import style as S

FONT = "Arial"
BLUE = S.SAR_BLUE.lstrip("#")
F_BASE = Font(name=FONT, size=10)
F_BOLD = Font(name=FONT, size=10, bold=True)
F_HDR = Font(name=FONT, size=10, bold=True, color="FFFFFF")
F_INPUT = Font(name=FONT, size=10, bold=True, color="0000FF")
F_TITLE = Font(name=FONT, size=18, bold=True, color=BLUE)
F_KPI = Font(name=FONT, size=18, bold=True, color="3D3935")
FILL_HDR = PatternFill("solid", fgColor=BLUE)
FILL_INPUT = PatternFill("solid", fgColor="FFFF00")
FILL_CARD = PatternFill("solid", fgColor="EEF2F4")
THIN = Side(style="thin", color="D9DEE2")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

# Data sheet column layout: (key, header, width)
COLS = [
    ("code", "Activity ID", 14), ("name", "Activity Name", 42), ("wbs", "WBS", 34), ("phase", "Phase", 20),
    ("disc", "Discipline", 16), ("loc", "Location", 18), ("con", "Contractor", 18), ("wp", "Work Package", 16),
    ("status", "Status", 13), ("ms", "Milestone", 10), ("crit", "Critical", 9), ("lp", "Longest Path", 11),
    ("tf", "Total Float (d)", 11), ("bls", "BL Start", 12), ("blf", "BL Finish", 12), ("st", "Start", 12),
    ("fin", "Finish", 12), ("pct", "% Complete", 10), ("w", "Weight", 12), ("blw", "BL Weight", 12),
    ("blbud", "BL Budget", 14), ("evbud", "EV Budget", 14), ("ac", "Actual Cost", 14), ("rem", "Remaining Cost", 14),
    ("cal", "BL Calendar", 11), ("incur", "In Current", 9),
    ("pf", "Planned Fraction", 12), ("inc", "In Filter", 9), ("fvar", "Finish Var (d)", 11),
    ("delayed", "Delayed", 9), ("look", "In Lookahead", 11), ("pf_app", "Planned Fraction (app)", 13),
]
COL = {k: get_column_letter(i) for i, (k, _h, _w) in enumerate(COLS, start=1)}


def _name(wb, name: str, ref: str) -> None:
    wb.defined_names[name] = DefinedName(name, attr_text=ref)


def _hdr(ws, row: int, headers: list[str], col: int = 1) -> None:
    for i, h in enumerate(headers):
        c = ws.cell(row=row, column=col + i, value=h)
        c.font, c.fill, c.border = F_HDR, FILL_HDR, BOX
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def export_dynamic(path, d) -> dict:
    """Write the dynamic workbook. Returns {'rows': n, 'formulas': m} for logging/tests."""
    ctx = d.ctx
    rows = list(ctx.rows)
    n = len(rows)
    last = n + 1
    wb = Workbook()
    dash = wb.active
    dash.title = "Dashboard"
    data = wb.create_sheet("Data")
    scs = wb.create_sheet("S-Curve")
    cals = wb.create_sheet("Calendars")
    lists = wb.create_sheet("Lists")
    readme = wb.create_sheet("Read Me")
    nformulas = 0

    # ------------------------------------------------------------------ Calendars
    cal_keys: dict[str, int] = {}
    cal_objs = []
    for r in rows:
        if r.bl is None:
            continue
        cal = ctx.bl.calendar(r.bl)
        if r.bl_cal_id not in cal_keys:
            cal_keys[r.bl_cal_id] = len(cal_keys) + 1
            cal_objs.append((cal_keys[r.bl_cal_id], cal))
    cals["A1"] = "Baseline calendars used by the Planned Fraction formulas"
    cals["A1"].font = F_BOLD
    cals["A2"] = ("Working-day table: for each date, the number of working days of each calendar before that date "
                  "(weekends, holidays and worked exception days from the XER calendar data).")
    _hdr(cals, 4, ["Key", "Calendar", "Hours/Day", "Work week (Mon..Sun, 1 = working)", "Holidays"])
    for i, (k, cal) in enumerate(cal_objs):
        rr = 5 + i
        cals.cell(row=rr, column=1, value=k)
        cals.cell(row=rr, column=2, value=cal.name)
        cals.cell(row=rr, column=3, value=cal.hours_per_day)
        cals.cell(row=rr, column=4, value="".join("1" if w else "0" for w in cal.workdays))
        cals.cell(row=rr, column=5, value=len(cal.holidays))
    ci = ctx.ci
    cum_col0 = 8  # H = date, I.. = cumulative working days per calendar key
    _hdr(cals, 4, ["Date"] + [f"Cal {k}" for k, _c in cal_objs] if cal_objs else ["Date", "Cal 1"], col=cum_col0)
    keys_in_order = [key for key, _k in sorted(cal_keys.items(), key=lambda kv: kv[1])] or [None]
    for i in range(ci.n + 1):
        rr = 5 + i
        dc = cals.cell(row=rr, column=cum_col0, value=ci.date_of(i))
        dc.number_format = "dd-mmm-yyyy"
        for j, key in enumerate(keys_in_order):
            cals.cell(row=rr, column=cum_col0 + 1 + j, value=int(ci.cums[key][i]) if key else 0)
    first_c = get_column_letter(cum_col0 + 1)
    last_c = get_column_letter(cum_col0 + len(keys_in_order))
    _name(wb, "CalCum", f"Calendars!${first_c}$5:${last_c}${5 + ci.n}")
    _name(wb, "CalOrigin", f"Calendars!${get_column_letter(cum_col0)}$5")
    _name(wb, "CalRows", f"Calendars!$G$2")
    cals["F2"] = "Rows:"
    cals["G2"] = ci.n + 1
    cals.column_dimensions[get_column_letter(cum_col0)].width = 13
    for col, w in (("A", 6), ("B", 30), ("C", 10), ("D", 22), ("E", 10)):
        cals.column_dimensions[col].width = w

    # ------------------------------------------------------------------ Lists
    dims = {"Phase": ctx.profile.category_names + ["Not Mapped"],
            "Discipline": ctx.dimension_values("Discipline"), "Location": ctx.dimension_values("Location"),
            "Contractor": ctx.dimension_values("Contractor"), "Work Package": ctx.dimension_values("Work Package")}
    list_refs = {}
    for ci, (dim, vals) in enumerate(dims.items(), start=1):
        letter = get_column_letter(ci)
        lists.cell(row=1, column=ci, value=dim).font = F_BOLD
        lists.cell(row=2, column=ci, value="All")
        for j, v in enumerate(vals, start=3):
            lists.cell(row=j, column=ci, value=v)
        list_refs[dim] = f"Lists!${letter}$2:${letter}${2 + len(vals)}"
        lists.column_dimensions[letter].width = 26

    # ------------------------------------------------------------------ Dashboard inputs
    dash.sheet_view.showGridLines = False
    dash["A1"] = "SAR  PROJECT CONTROLS DASHBOARD"
    dash["A1"].font = F_TITLE
    p = ctx.cur.project
    dash["A2"] = (f"{p.name} ({p.short_name})  ·  Current: {ctx.cur.source_name}  ·  Baseline: {ctx.bl.source_name}"
                  f"  ·  Generated {datetime.now():%d %b %Y %H:%M} by {APP_NAME} v{__version__}")
    dash["A2"].font = Font(name=FONT, size=9, color="52514E")
    dash["A4"] = "INPUTS (yellow cells - change them and everything recalculates)"
    dash["A4"].font = F_BOLD
    inputs = [
        ("Data Date", "DataDate", ctx.data_date.date() if ctx.data_date else None, "dd-mmm-yyyy",
         "Current schedule Data Date from the XER (PROJECT.last_recalc_date). Change it to see planned progress at another date."),
        ("Phase", "F_Phase", "All", None, "Filter by mapped phase category"),
        ("Discipline", "F_Disc", "All", None, "Filter by Discipline activity code"),
        ("Location", "F_Loc", "All", None, "Filter by Location activity code"),
        ("Contractor", "F_Con", "All", None, "Filter by Contractor activity code"),
        ("Work Package", "F_WP", "All", None, "Filter by Work Package activity code"),
        ("Lookahead (weeks)", "LookWeeks", ctx.settings.lookahead_weeks, "0", "Lookahead window length"),
        ("Delay tolerance (days)", "Tolerance", ctx.settings.delay_tolerance_days, "0", "Finish variance above this = Delayed"),
    ]
    dim_for = {"F_Phase": "Phase", "F_Disc": "Discipline", "F_Loc": "Location", "F_Con": "Contractor", "F_WP": "Work Package"}
    for i, (label, name, val, fmt, note) in enumerate(inputs):
        rr = 5 + i
        dash.cell(row=rr, column=1, value=label).font = F_BOLD
        c = dash.cell(row=rr, column=2, value=val)
        c.font, c.fill, c.border = F_INPUT, FILL_INPUT, BOX
        if fmt:
            c.number_format = fmt
        c.comment = Comment(note, APP_NAME)
        _name(wb, name, f"Dashboard!$B${rr}")
        if name in dim_for:
            dv = DataValidation(type="list", formula1="=" + list_refs[dim_for[name]], allow_blank=False)
            dv.error, dv.errorTitle = "Pick a value from the list", "Filter"
            dash.add_data_validation(dv)
            dv.add(c)
    dash["D5"] = "Weighting method (from application):"
    dash["D5"].font = F_BOLD
    dash["F5"] = ctx.weighting
    dash["D6"] = "Progress measure:"
    dash["D6"].font = F_BOLD
    dash["F6"] = ctx.measure
    dash["D7"] = "Critical definition:"
    dash["D7"].font = F_BOLD
    dash["F7"] = ctx.critical_info["source"]
    dash["D8"] = "Longest Path source:"
    dash["D8"].font = F_BOLD
    dash["F8"] = ctx.critical_info["longest_path_source"]

    # ------------------------------------------------------------------ Data sheet
    _hdr(data, 1, [h for _k, h, _w in COLS])
    data.freeze_panes = "C2"
    for i, (_k, _h, w) in enumerate(COLS, start=1):
        data.column_dimensions[get_column_letter(i)].width = w
    date_cols = {"bls", "blf", "st", "fin"}
    for i, r in enumerate(rows, start=2):
        a, b = r.cur, r.bl
        ev_bud = (b.budget_cost if b is not None else (a.budget_cost if a is not None else 0.0)) if a is not None else 0.0
        from ..analysis.metrics import planned_fraction
        pf_app = planned_fraction(ctx, r, ctx.data_date)
        vals = {
            "code": r.code, "name": r.name, "wbs": r.wbs_path, "phase": r.phase or "Not Mapped",
            "disc": r.dims.get("Discipline", ""), "loc": r.dims.get("Location", ""),
            "con": r.dims.get("Contractor", ""), "wp": r.dims.get("Work Package", ""),
            "status": r.status if a is not None else "Not in Current", "ms": "Yes" if r.is_milestone else "No",
            "crit": "Yes" if r.is_critical else "No", "lp": "Yes" if r.is_longest_path else "No",
            "tf": r.tf_d, "bls": b.start if b is not None else None, "blf": b.finish if b is not None else None,
            "st": r.start, "fin": r.finish, "pct": r.pct if a is not None else 0.0,
            "w": r.weight, "blw": r.bl_weight, "blbud": b.budget_cost if b is not None else 0.0,
            "evbud": ev_bud, "ac": a.actual_cost if a is not None else 0.0,
            "rem": a.remaining_cost if a is not None else 0.0,
            "cal": cal_keys.get(r.bl_cal_id, "") if b is not None else "",
            "incur": 1 if a is not None else 0,
            "pf_app": pf_app,
        }
        for key, v in vals.items():
            c = data[f"{COL[key]}{i}"]
            if key in date_cols and v is not None:
                v = v.replace(second=0, microsecond=0)
                c.number_format = "dd-mmm-yyyy"
            c.value = v
            c.font = F_BASE
        C = {k: f"{COL[k]}{i}" for k in COL}
        f = {
            "pf": (f'=IF(OR({C["bls"]}="",{C["blf"]}="",{C["cal"]}=""),0,IF(DataDate<=INT({C["bls"]}),0,'
                   f'IF(DataDate>INT({C["blf"]}),1,IFERROR((INDEX(CalCum,MIN(CalRows,DataDate-CalOrigin+1),{C["cal"]})'
                   f'-INDEX(CalCum,MAX(1,INT({C["bls"]})-CalOrigin+1),{C["cal"]}))/(INDEX(CalCum,MIN(CalRows,INT({C["blf"]})-CalOrigin+2),{C["cal"]})'
                   f'-INDEX(CalCum,MAX(1,INT({C["bls"]})-CalOrigin+1),{C["cal"]})),1))))'),
            "inc": (f'=IF(AND(OR(F_Phase="All",{C["phase"]}=F_Phase),OR(F_Disc="All",{C["disc"]}=F_Disc),'
                    f'OR(F_Loc="All",{C["loc"]}=F_Loc),OR(F_Con="All",{C["con"]}=F_Con),OR(F_WP="All",{C["wp"]}=F_WP)),1,0)'),
            "fvar": f'=IF(AND({C["incur"]}=1,ISNUMBER({C["fin"]}),ISNUMBER({C["blf"]})),INT({C["fin"]})-INT({C["blf"]}),"")',
            "delayed": (f'=IF(AND({C["incur"]}=1,{C["status"]}<>"Completed",OR(AND(ISNUMBER({C["blf"]}),'
                        f'INT({C["blf"]})<DataDate),AND(ISNUMBER({C["fvar"]}),N({C["fvar"]})>Tolerance))),1,0)'),
            "look": (f'=IF(AND({C["incur"]}=1,{C["status"]}<>"Completed",OR(AND(ISNUMBER({C["st"]}),ISNUMBER({C["fin"]}),'
                     f'INT({C["st"]})<=DataDate+7*LookWeeks,{C["fin"]}>=DataDate),AND(ISNUMBER({C["blf"]}),'
                     f'INT({C["blf"]})<DataDate))),1,0)'),
        }
        for key, formula in f.items():
            c = data[C[key]]
            c.value = formula
            c.font = F_BASE
            nformulas += 1
        data[C["pf"]].number_format = "0.000"
        data[C["pf_app"]].number_format = "0.000"
        data[C["pct"]].number_format = "0.0"
    data.auto_filter.ref = f"A1:{get_column_letter(len(COLS))}{last}"
    names = {"D_Phase": "phase", "D_Disc": "disc", "D_Loc": "loc", "D_Con": "con", "D_WP": "wp", "D_Status": "status",
             "D_MS": "ms", "D_Crit": "crit", "D_LP": "lp", "D_TF": "tf", "D_BLFin": "blf", "D_Fin": "fin",
             "D_Pct": "pct", "D_W": "w", "D_BLW": "blw", "D_BLBud": "blbud", "D_EVBud": "evbud", "D_AC": "ac",
             "D_Rem": "rem", "D_InCur": "incur", "D_PF": "pf", "D_Inc": "inc", "D_Delayed": "delayed",
             "D_Look": "look", "D_FVar": "fvar"}
    for nm, key in names.items():
        _name(wb, nm, f"Data!${COL[key]}$2:${COL[key]}${max(last, 2)}")

    # ------------------------------------------------------------------ Dashboard KPIs
    def kpi(cell, label, formula, fmt, note):
        nonlocal nformulas
        col, row = cell[0], int(cell[1:])
        lab = dash[f"{col}{row}"]
        lab.value, lab.font, lab.fill = label, F_BOLD, FILL_CARD
        v = dash[f"{col}{row + 1}"]
        v.value, v.font, v.fill, v.number_format = formula, F_KPI, FILL_CARD, fmt
        v.alignment = Alignment(horizontal="left")
        v.comment = Comment(note, APP_NAME)
        nformulas += 1
        return f"Dashboard!${col}${row + 1}"

    dash["A14"] = "KEY PERFORMANCE INDICATORS (all Excel formulas - click a cell to see it)"
    dash["A14"].font = F_BOLD
    k_act = kpi("A15", "Actual Progress", "=IFERROR(SUMPRODUCT(D_Inc,D_InCur,D_W,D_Pct)/100/SUMPRODUCT(D_Inc,D_InCur,D_W),\"N/A\")",
                "0.0%", "Σ(weight × % complete) / Σ weight over filtered current activities")
    k_pln = kpi("B15", "Planned Progress", "=IFERROR(SUMPRODUCT(D_Inc,D_BLW,D_PF)/SUMPRODUCT(D_Inc,D_BLW),\"N/A\")",
                "0.0%", "Σ(baseline weight × planned fraction at Data Date) / Σ baseline weight")
    _name(wb, "K_Actual", k_act)
    _name(wb, "K_Planned", k_pln)
    kpi("C15", "Progress Variance", "=IFERROR(K_Actual-K_Planned,\"N/A\")", "+0.0%;-0.0%;0.0%", "Actual − Planned")
    k_bac = kpi("D15", "BAC", "=SUMPRODUCT(D_Inc,D_BLBud)", "#,##0", "Σ baseline budget cost")
    k_pv = kpi("E15", "PV", "=SUMPRODUCT(D_Inc,D_BLBud,D_PF)", "#,##0", "Σ baseline budget × planned fraction")
    k_ev = kpi("F15", "EV", "=SUMPRODUCT(D_Inc,D_InCur,D_EVBud,D_Pct)/100", "#,##0", "Σ baseline budget × % complete (P6 method)")
    k_ac = kpi("G15", "AC", "=SUMPRODUCT(D_Inc,D_InCur,D_AC)", "#,##0", "Σ actual cost (resources + expenses)")
    for nm, ref in (("K_BAC", k_bac), ("K_PV", k_pv), ("K_EV", k_ev), ("K_AC", k_ac)):
        _name(wb, nm, ref)
    kpi("A18", "SPI", "=IFERROR(IF(K_BAC>0,K_EV/K_PV,K_Actual/K_Planned),\"N/A\")", "0.00",
        "EV / PV when the baseline is cost-loaded, otherwise Actual % / Planned % (progress-based)")
    kpi("B18", "CPI", "=IF(K_AC>0,IFERROR(K_EV/K_AC,\"N/A\"),\"N/A - Actual Cost Not Available\")", "0.00",
        "EV / AC - only when actual cost exists; never inferred from schedule data")
    kpi("C18", "Baseline Finish", "=SUMPRODUCT(MAX(D_Inc*D_BLFin))", "dd-mmm-yyyy", "Latest baseline finish in the filter")
    kpi("D18", "Forecast Finish", "=SUMPRODUCT(MAX(D_Inc*D_InCur*D_Fin))", "dd-mmm-yyyy", "Latest current finish in the filter")
    kpi("E18", "Days Behind (+) / Ahead (−)", "=IF(OR(C19=0,D19=0),\"N/A\",INT(D19)-INT(C19))", "+0;-0;0",
        "Forecast Finish − Baseline Finish, calendar days")
    kpi("F18", "Critical Activities", "=SUMPRODUCT(D_Inc*(D_Crit=\"Yes\"))", "0", "Critical per the P6 project setting (see F7)")
    kpi("G18", "Longest Path", "=SUMPRODUCT(D_Inc*(D_LP=\"Yes\"))", "0", "Incomplete activities on the Longest Path")
    kpi("A21", "Negative Float", "=SUMPRODUCT(D_Inc*D_InCur*(D_Status<>\"Completed\")*(D_TF<0))", "0",
        "Incomplete activities with Total Float < 0")
    kpi("B21", "Delayed / Overdue", "=SUMPRODUCT(D_Inc,D_Delayed)", "0", "Incomplete and (overdue or finish variance > tolerance)")
    kpi("C21", "In Lookahead", "=SUMPRODUCT(D_Inc,D_Look)", "0", "Starting within the lookahead window, or overdue")
    kpi("D21", "Activities in Filter", "=SUMPRODUCT(D_Inc,D_InCur)", "0", "Current activities matching the filters")
    kpi("E21", "Milestones", "=SUMPRODUCT(D_Inc*D_InCur*(D_MS=\"Yes\"))", "0", "Milestone activities in the filter")
    kpi("F21", "EAC (CPI)", "=IF(AND(K_AC>0,K_EV>0),K_BAC/(K_EV/K_AC),\"N/A\")", "#,##0", "BAC / CPI")
    kpi("G21", "EAC (bottom-up)", "=IF(K_AC>0,K_AC+SUMPRODUCT(D_Inc,D_InCur,D_Rem),\"N/A\")", "#,##0", "AC + Σ remaining cost")
    dash["A23"] = "Check vs application at export: Actual / Planned ="
    dash["A23"].font = Font(name=FONT, size=9, color="52514E")
    pk = d.kpis
    dash["D23"] = f"{pk['progress_actual'].display} / {pk['progress_planned'].display} (all activities, export Data Date)"
    dash["D23"].font = Font(name=FONT, size=9, color="52514E")

    # ------------------------------------------------------------------ Status table (donut)
    dash["A25"] = "STATUS (mutually exclusive)"
    dash["A25"].font = F_BOLD
    _hdr(dash, 26, ["Status", "Activities"])
    status_rows = [
        ("Completed", "=SUMPRODUCT(D_Inc*D_InCur*(D_Status=\"Completed\"))"),
        ("In Progress", "=SUMPRODUCT(D_Inc*D_InCur*(D_Status=\"In Progress\")*(D_Delayed=0))"),
        ("Not Started", "=SUMPRODUCT(D_Inc*D_InCur*(D_Status=\"Not Started\")*(D_Delayed=0))"),
        ("Delayed", "=SUMPRODUCT(D_Inc,D_Delayed)"),
    ]
    for j, (lab, fml) in enumerate(status_rows, start=27):
        dash.cell(row=j, column=1, value=lab).font = F_BASE
        c = dash.cell(row=j, column=2, value=fml)
        c.font = F_BASE
        nformulas += 1

    # ------------------------------------------------------------------ Phase table
    dash["D25"] = "PROGRESS BY PHASE"
    dash["D25"].font = F_BOLD
    _hdr(dash, 26, ["Phase", "Activities", "Actual %", "Planned %", "Variance"], col=4)
    phases = ctx.profile.category_names
    for j, ph in enumerate(phases, start=27):
        dash.cell(row=j, column=4, value=ph).font = F_BASE
        a = f"$D{j}"
        cells = [
            f"=SUMPRODUCT(D_Inc*D_InCur*(D_Phase={a}))",
            f"=IFERROR(SUMPRODUCT(D_Inc*D_InCur*(D_Phase={a})*D_W*D_Pct)/100/SUMPRODUCT(D_Inc*D_InCur*(D_Phase={a})*D_W),0)",
            f"=IFERROR(SUMPRODUCT(D_Inc*(D_Phase={a})*D_BLW*D_PF)/SUMPRODUCT(D_Inc*(D_Phase={a})*D_BLW),0)",
            f"=F{j}-G{j}",
        ]
        for k, fml in enumerate(cells):
            c = dash.cell(row=j, column=5 + k, value=fml)
            c.font = F_BASE
            c.number_format = "0" if k == 0 else "0.0%"
            nformulas += 1
    ph_end = 26 + len(phases)

    # ------------------------------------------------------------------ Discipline cost table
    disc_vals = ctx.dimension_values("Discipline")
    grp_name, grp_range = ("Discipline", "D_Disc") if disc_vals else ("Phase", "D_Phase")
    groups = disc_vals if disc_vals else phases
    t0 = max(ph_end, 30) + 3
    dash.cell(row=t0, column=1, value=f"COST AND PROGRESS BY {grp_name.upper()}").font = F_BOLD
    _hdr(dash, t0 + 1, [grp_name, "BL Budget", "Actual Cost", "Forecast (AC + Remaining)", "Actual %", "Planned %"])
    for j, g in enumerate(groups, start=t0 + 2):
        dash.cell(row=j, column=1, value=g).font = F_BASE
        a = f"$A{j}"
        cells = [
            f"=SUMPRODUCT(D_Inc*({grp_range}={a})*D_BLBud)",
            f"=SUMPRODUCT(D_Inc*D_InCur*({grp_range}={a})*D_AC)",
            f"=SUMPRODUCT(D_Inc*D_InCur*({grp_range}={a})*(D_AC+D_Rem))",
            f"=IFERROR(SUMPRODUCT(D_Inc*D_InCur*({grp_range}={a})*D_W*D_Pct)/100/SUMPRODUCT(D_Inc*D_InCur*({grp_range}={a})*D_W),0)",
            f"=IFERROR(SUMPRODUCT(D_Inc*({grp_range}={a})*D_BLW*D_PF)/SUMPRODUCT(D_Inc*({grp_range}={a})*D_BLW),0)",
        ]
        for k, fml in enumerate(cells):
            c = dash.cell(row=j, column=2 + k, value=fml)
            c.font = F_BASE
            c.number_format = "#,##0" if k < 3 else "0.0%"
            nformulas += 1
    grp_end = t0 + 1 + len(groups)
    for col, w in zip("ABCDEFGH", (24, 20, 22, 24, 16, 18, 18, 16)):
        dash.column_dimensions[col].width = w

    # ------------------------------------------------------------------ S-Curve (reference values)
    sc = d.s_curve
    scs["A1"] = ("S-Curve values computed by the application for the application's filter at export "
                 f"({d.filt.describe()}) - reference only; these do not change with the Excel filters.")
    scs["A1"].font = F_BOLD
    _hdr(scs, 3, ["Period", "Baseline Planned %", "Actual %", "Forecast %"])
    for j, dt in enumerate(sc.get("dates", []), start=4):
        scs.cell(row=j, column=1, value=dt).number_format = "mmm-yyyy"
        for k, key in enumerate(("planned", "actual", "forecast"), start=2):
            v = sc[key][j - 4]
            c = scs.cell(row=j, column=k, value=None if v is None else v / 100.0)
            c.number_format = "0.0%"
    sc_end = 3 + len(sc.get("dates", []))
    for col, w in zip("ABCD", (14, 18, 12, 12)):
        scs.column_dimensions[col].width = w

    # ------------------------------------------------------------------ Charts
    bar = BarChart()
    bar.type = "bar"
    bar.title = "Progress by Phase"
    bar.y_axis.title = "%"
    bar.y_axis.number_format = "0%"
    bar.add_data(Reference(dash, min_col=6, max_col=7, min_row=26, max_row=ph_end), titles_from_data=True)
    bar.set_categories(Reference(dash, min_col=4, min_row=27, max_row=ph_end))
    bar.height, bar.width = 8, 16
    bar.series[0].graphicalProperties.solidFill = S.ACTUAL.lstrip("#")
    bar.series[1].graphicalProperties.solidFill = S.PLANNED.lstrip("#")
    dash.add_chart(bar, "J4")
    dn = DoughnutChart()
    dn.title = "Activity Status"
    dn.add_data(Reference(dash, min_col=2, min_row=26, max_row=30), titles_from_data=True)
    dn.set_categories(Reference(dash, min_col=1, min_row=27, max_row=30))
    dn.height, dn.width = 8, 10
    from openpyxl.chart.series import DataPoint
    for idx, key in enumerate(("Completed", "In Progress", "Not Started", "Delayed")):
        pt = DataPoint(idx=idx)
        pt.graphicalProperties.solidFill = S.BUCKET_COLORS[key].lstrip("#")
        dn.series[0].dPt.append(pt)
    dash.add_chart(dn, "J21")
    cb = BarChart()
    cb.title = f"Cost by {grp_name}"
    cb.add_data(Reference(dash, min_col=2, max_col=3, min_row=t0 + 1, max_row=grp_end), titles_from_data=True)
    cb.set_categories(Reference(dash, min_col=1, min_row=t0 + 2, max_row=grp_end))
    cb.height, cb.width = 8, 16
    cb.series[0].graphicalProperties.solidFill = S.PLANNED.lstrip("#")
    cb.series[1].graphicalProperties.solidFill = S.ACTUAL.lstrip("#")
    dash.add_chart(cb, "P21")
    if sc_end > 3:
        lc = LineChart()
        lc.title = "Progress S-Curve"
        lc.y_axis.number_format = "0%"
        lc.add_data(Reference(scs, min_col=2, max_col=4, min_row=3, max_row=sc_end), titles_from_data=True)
        lc.set_categories(Reference(scs, min_col=1, min_row=4, max_row=sc_end))
        lc.height, lc.width = 8, 16
        lc.x_axis.number_format = "mmm-yy"
        colors = [S.PLANNED, S.ACTUAL, S.FORECAST]
        for s, col in zip(lc.series, colors):
            s.graphicalProperties.line.solidFill = col.lstrip("#")
            s.graphicalProperties.line.width = 22000
            s.smooth = False
        lc.series[0].graphicalProperties.line.dashStyle = "dash"
        lc.series[2].graphicalProperties.line.dashStyle = "sysDot"
        dash.add_chart(lc, "P4")

    # ------------------------------------------------------------------ Read Me
    readme.column_dimensions["A"].width = 120
    lines = [
        ("HOW TO USE THIS WORKBOOK", True),
        ("1. Go to the Dashboard sheet. Yellow cells (column B, rows 5-12) are inputs.", False),
        ("2. Pick a filter from the dropdowns (Phase, Discipline, Location, Contractor, Work Package) or type 'All'.", False),
        ("3. Change the Data Date to see planned progress / PV / delays at another date.", False),
        ("4. KPIs, the phase / status / cost tables and the Phase, Status and Cost charts recalculate automatically.", False),
        ("5. On the Data sheet use the AutoFilter on 'In Filter' = 1 or 'In Lookahead' = 1 to list the activities behind a number.", False),
        ("", False),
        ("SOURCE DATA vs FORMULAS", True),
        ("Data columns A-Z are values from the XER / application (source data, mapping and critical flags at export).", False),
        ("Columns AA-AE are formulas: Planned Fraction, In Filter, Finish Var, Delayed, In Lookahead.", False),
        ("Planned Fraction = working days from BL Start to the day before the Data Date / working days from BL Start to "
         "BL Finish, read from the baseline calendar's working-day table on the Calendars sheet (named range CalCum). "
         "'Planned Fraction (app)' is the application's value at the export Data Date, for audit - they must be equal.", False),
        ("Weights (column S / T) follow the application weighting method shown on the Dashboard (cell F5). Milestones, LOE and "
         "WBS summaries carry zero weight.", False),
        ("CPI shows 'N/A' when no actual cost exists - it is never derived from schedule data.", False),
        ("Critical / Longest Path flags are those calculated by the application (P6 settings) at export; they do not change "
         "with the Data Date input.", False),
        ("The S-Curve sheet holds reference values from the application and is not filter-dependent.", False),
        ("", False),
        (f"Exported {datetime.now():%d %b %Y %H:%M} · {APP_NAME} v{__version__} · Current XER {ctx.cur.source_name} · "
         f"Baseline XER {ctx.bl.source_name}", False),
    ]
    for i, (t, bold) in enumerate(lines, start=1):
        c = readme.cell(row=i, column=1, value=t)
        c.font = F_BOLD if bold else F_BASE
        c.alignment = Alignment(wrap_text=True)
    for ws in (dash, lists, cals, scs):
        for row in ws.iter_rows():
            for c in row:
                if c.value is not None and (c.font is None or c.font.name != FONT):
                    c.font = Font(name=FONT, size=c.font.size if c.font else 10, bold=c.font.bold if c.font else False,
                                  color=c.font.color if c.font else None)
    wb.save(path)
    return {"rows": n, "formulas": nformulas}
