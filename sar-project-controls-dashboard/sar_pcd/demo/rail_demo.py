"""Demonstration rail project (fictional data) + naming-convention variants.

``build_demo()`` returns (baseline_xer_text, current_xer_text). The current
update contains deliberate changes versus the baseline (renamed, added,
deleted, split activities, duration and logic changes) so every screen of the
application has something to show.

``build_variant(scheme)`` produces the same logical project with completely
different WBS / activity naming (used by the tests: Project A/B/C).
"""
from __future__ import annotations

import copy
from datetime import date

from .generator import GA, GenProject, WorkCal, _hash01, baseline_dates, build_xer, simulate_progress

SECTIONS = ["A", "B", "C"]
STATIONS = ["North", "Central", "South"]

SCHEMES = {
    # Project A: conventional EPC naming
    "A": dict(
        wbs={"ENG": "Engineering", "ENG.DD": "Detailed Design", "ENG.RV": "Design Review & Approvals",
             "PRC": "Procurement", "PRC.LL": "Long Lead Items", "PRC.GM": "General Materials",
             "CNS": "Construction", "CNS.EW": "Earthworks", "CNS.TW": "Track Works",
             "CNS.ST": "Stations & Structures", "CNS.SY": "Systems Installation",
             "TST": "Testing & Commissioning", "HND": "Handover", "MIL": "Key Milestones"},
        design="Detailed Design", review="Design Review", ifc="IFC Drawings",
        submittal="Technical Submittal", approval="Submittal Approval", po="Purchase Order",
        mfg="Manufacturing", fat="FAT", ship="Shipping", deliver="Delivery to Site",
        earth="Earthworks", drain="Drainage & Culverts", subb="Sub-ballast", track="Track Installation",
        ballast="Ballast & Tamping", found="Foundations", struct="Station Structure",
        arch="Architectural Finishes", mep="MEP Installation", platform="Platform Finishes",
        ocs="OCS Installation", sig="Signalling Installation", tel="Telecom Installation",
        systest="System Testing", integ="Integration Testing", energ="Energization", trial="Trial Running",
        asbuilt="As-built Documentation", om="O&M Manuals & Training",
        prefix={"ENG": "ENG", "PRC": "PRC", "CNS": "CNS", "TST": "TST", "HND": "HND", "MIL": "MS"},
    ),
    # Project B: design / supply chain / site execution vocabulary
    "B": dict(
        wbs={"ENG": "Design", "ENG.DD": "Design Development", "ENG.RV": "Design Checks",
             "PRC": "Supply Chain", "PRC.LL": "Critical Supplies", "PRC.GM": "Bulk Supplies",
             "CNS": "Site Execution", "CNS.EW": "Formation Works", "CNS.TW": "Permanent Way",
             "CNS.ST": "Station Buildings", "CNS.SY": "Railway Systems Works",
             "TST": "Integration & Trials", "HND": "Close-out", "MIL": "Contract Milestones"},
        design="Design Development", review="Design Check", ifc="Issued for Construction Package",
        submittal="Vendor Data Submission", approval="Vendor Data Approval", po="Order Placement",
        mfg="Fabrication", fat="Factory Acceptance Test", ship="Shipment", deliver="Arrival on Site",
        earth="Cut and Fill", drain="Culvert Construction", subb="Formation Layer", track="Rail Laying",
        ballast="Ballasting", found="Piling and Footings", struct="Building Frame",
        arch="Fit-out", mep="Building Services", platform="Platform Works",
        ocs="Catenary Erection", sig="Interlocking Works", tel="Comms Network Works",
        systest="Subsystem Tests", integ="System Integration Tests", energ="Power-on", trial="Trial Operations",
        asbuilt="Record Drawings", om="Operator Training",
        prefix={"ENG": "D", "PRC": "S", "CNS": "X", "TST": "T", "HND": "C", "MIL": "M"},
    ),
    # Project C: terse abbreviations
    "C": dict(
        wbs={"ENG": "ENG", "ENG.DD": "ENG DSGN", "ENG.RV": "ENG RVW",
             "PRC": "MAT", "PRC.LL": "MAT LLI", "PRC.GM": "MAT BULK",
             "CNS": "CIVIL", "CNS.EW": "CIVIL EW", "CNS.TW": "CIVIL TRK",
             "CNS.ST": "CIVIL STN", "CNS.SY": "E&M SYS",
             "TST": "T&C", "HND": "HO", "MIL": "KEY DATES"},
        design="Dsgn", review="Dsgn Rvw", ifc="IFC Issue",
        submittal="Tech Sub", approval="Approval", po="PO",
        mfg="Mfg", fat="FAT", ship="Shpt", deliver="Dlvry",
        earth="Excavation & Backfill", drain="Culverts", subb="Subgrade", track="Track Laying",
        ballast="Tamping", found="Fdn", struct="Superstructure Concrete",
        arch="Arch Fin", mep="MEP", platform="Platform",
        ocs="OCS Erection", sig="SIG Install", tel="TEL Install",
        systest="SAT", integ="Integrated Test", energ="Energisation", trial="Trial Run",
        asbuilt="As-Built", om="O&M Trng",
        prefix={"ENG": "E", "PRC": "M", "CNS": "C", "TST": "TC", "HND": "HO", "MIL": "KD"},
    ),
}

PHASE_OF_WBS_KEY = {"ENG": "Engineering", "PRC": "Procurement", "CNS": "Construction",
                    "TST": "Testing & Commissioning", "HND": "Handover", "MIL": None}

CODE_TYPES = {
    "Discipline": {"DES": "Design", "PRC": "Procurement", "CIV": "Civil", "TRK": "Track Works",
                   "STN": "Stations", "SYS": "Systems", "TNC": "Testing & Commissioning", "MGT": "Management"},
    "Location": {"SEC-A": "Section A (km 0-40)", "SEC-B": "Section B (km 40-85)", "SEC-C": "Section C (km 85-120)",
                 "STN-N": "North Station", "STN-C": "Central Station", "STN-S": "South Station", "ALL": "Route-wide"},
    "Contractor": {"DC": "Design Consultant", "MC": "Main Civil Contractor", "SC": "Systems Contractor",
                   "SUP": "Suppliers"},
    "Work Package": {"WP01": "WP01 Design", "WP02": "WP02 Supply", "WP03": "WP03 Civil & Track",
                     "WP04": "WP04 Stations", "WP05": "WP05 Systems", "WP06": "WP06 T&C and Handover"},
}


def _spec(scheme: str) -> GenProject:
    S = SCHEMES[scheme]
    P = S["prefix"]
    W = S["wbs"]
    # wbs_short_name holds the code segment of each level (P6 joins them with '.')
    wbs = [("MIL", None, "0", W["MIL"]), ("ENG", None, "1", W["ENG"]), ("ENG.DD", "ENG", "1", W["ENG.DD"]),
           ("ENG.RV", "ENG", "2", W["ENG.RV"]), ("PRC", None, "2", W["PRC"]), ("PRC.LL", "PRC", "1", W["PRC.LL"]),
           ("PRC.GM", "PRC", "2", W["PRC.GM"]), ("CNS", None, "3", W["CNS"]), ("CNS.EW", "CNS", "1", W["CNS.EW"]),
           ("CNS.TW", "CNS", "2", W["CNS.TW"]), ("CNS.ST", "CNS", "3", W["CNS.ST"]),
           ("CNS.SY", "CNS", "4", W["CNS.SY"]), ("TST", None, "4", W["TST"]), ("HND", None, "5", W["HND"])]
    acts: list[GA] = []
    seq = {k: 1000 for k in P}

    def code(phase: str) -> str:
        seq[phase] += 10
        return f"{P[phase]}-{seq[phase]}"

    def add(phase, name, wbs_key, dur, preds=(), kind="task", disc=None, loc="ALL", con="MC", wp="WP03", rate=0.0):
        c = code(phase)
        codes = {"Location": loc, "Contractor": con, "Work Package": wp}
        if disc:
            codes["Discipline"] = disc
        acts.append(GA(c, name, wbs_key, dur, list(preds), kind, codes, rate))
        return c

    ntp = add("MIL", "Notice to Proceed" if scheme != "C" else "NTP", "MIL", 0, kind="start_ms", disc="MGT", wp="WP01")
    # --- Engineering
    ifc = {}
    rev = {}
    for s in SECTIONS:
        d = add("ENG", f"{S['design']} - Section {s}", "ENG.DD", 55 + 5 * SECTIONS.index(s), [(ntp, "FS", 0)],
                disc="DES", loc=f"SEC-{s}", con="DC", wp="WP01", rate=9000)
        r = add("ENG", f"{S['review']} - Section {s}", "ENG.RV", 20, [(d, "FS", 0)], disc="DES", loc=f"SEC-{s}", con="DC", wp="WP01", rate=6000)
        ifc[s] = add("ENG", f"{S['ifc']} - Section {s}", "ENG.RV", 10, [(r, "FS", 0)], disc="DES", loc=f"SEC-{s}", con="DC", wp="WP01", rate=4000)
        rev[s] = r
    for st in STATIONS:
        loc = f"STN-{st[0]}"
        d = add("ENG", f"{S['design']} - {st} Station", "ENG.DD", 70, [(ntp, "FS", 10)], disc="DES", loc=loc, con="DC", wp="WP01", rate=8000)
        r = add("ENG", f"{S['review']} - {st} Station", "ENG.RV", 20, [(d, "FS", 0)], disc="DES", loc=loc, con="DC", wp="WP01", rate=5000)
        ifc[st] = add("ENG", f"{S['ifc']} - {st} Station", "ENG.RV", 10, [(r, "FS", 0)], disc="DES", loc=loc, con="DC", wp="WP01", rate=3000)
    sysd = {}
    for sysname in ("OCS", "Signalling", "Telecom"):
        nm = f"{sysname} {S['design']}" if scheme != "C" else f"{sysname[:3].upper()} {S['design']}"
        sysd[sysname] = add("ENG", nm, "ENG.DD", 80, [(ntp, "FS", 0)], disc="DES", con="DC", wp="WP01", rate=10000)
    sysrev = add("ENG", f"{S['review']} - Systems", "ENG.RV", 25, [(v, "FS", 0) for v in sysd.values()], disc="DES", con="DC", wp="WP01", rate=6000)
    add("ENG", "Design Material Support", "ENG.DD", 60, [(sysrev, "SS", 5)], disc="DES", con="DC", wp="WP01", rate=2500)
    shop = add("ENG", "Shop Drawings - Track Works" if scheme != "C" else "Shop Dwg TRK", "ENG.RV", 25, [(ifc["A"], "FS", 0)], disc="DES", con="MC", wp="WP01", rate=3000)
    dcomp = add("MIL", "Design Complete" if scheme != "C" else "Dsgn Compl", "MIL", 0,
                [(ifc[k], "FS", 0) for k in ifc] + [(sysrev, "FS", 0)], kind="finish_ms", disc="MGT", wp="WP01")
    # --- Procurement chains
    deliv = {}
    items = [("Rails", "FS", rev["A"], 90), ("Turnouts", "FS", rev["B"], 100), ("Signalling Equipment", "FS", sysrev, 120),
             ("OCS Materials", "FS", sysrev, 80), ("Station Steel", "FS", rev["A"], 60)]
    for item, _t, driver, mfg in items:
        c1 = add("PRC", f"{item} - {S['submittal']}", "PRC.LL", 15, [(driver, "FS", 0)], disc="PRC", con="SUP", wp="WP02", rate=1500)
        c2 = add("PRC", f"{item} - {S['approval']}", "PRC.LL", 10, [(c1, "FS", 0)], disc="PRC", con="SUP", wp="WP02", rate=1000)
        c3 = add("PRC", f"{item} - {S['po']}", "PRC.LL", 5, [(c2, "FS", 0)], disc="PRC", con="SUP", wp="WP02", rate=1000)
        c4 = add("PRC", f"{item} - {S['mfg']}", "PRC.LL", mfg, [(c3, "FS", 0)], disc="PRC", con="SUP", wp="WP02", rate=20000)
        c5 = add("PRC", f"{item} - {S['fat']}", "PRC.LL", 5, [(c4, "FS", 0)], disc="PRC", con="SUP", wp="WP02", rate=3000)
        c6 = add("PRC", f"{item} - {S['ship']}", "PRC.LL", 30, [(c5, "FS", 0)], disc="PRC", con="SUP", wp="WP02", rate=4000)
        deliv[item] = add("PRC", f"{item} - {S['deliver']}", "PRC.LL", 10, [(c6, "FS", 0)], disc="PRC", con="SUP", wp="WP02", rate=2000)
    conc = add("PRC", "Concrete Supply Contract" if scheme != "C" else "Conc Supply", "PRC.GM", 20, [(ntp, "FS", 20)], disc="PRC", con="SUP", wp="WP02", rate=1500)
    ball = []
    for b in (1, 2, 3):
        ball.append(add("PRC", f"Ballast Supply - Batch {b}" if scheme != "C" else f"Ballast Batch {b}", "PRC.GM", 40,
                        [(conc, "FS", 20 * (b - 1))], disc="PRC", con="SUP", wp="WP02", rate=8000))
    # --- Construction
    track = {}
    ew_done = []
    for i, s in enumerate(SECTIONS):
        loc = f"SEC-{s}"
        mob = add("CNS", f"Site Mobilization - Section {s}" if scheme != "C" else f"Mob Sec {s}", "CNS.EW", 15, [(ifc[s], "SS", 0)], disc="CIV", loc=loc, rate=5000)
        ew = add("CNS", f"{S['earth']} - Section {s}", "CNS.EW", 80, [(mob, "FS", 0), (ifc[s], "FS", 0)], disc="CIV", loc=loc, rate=30000)
        dr = add("CNS", f"{S['drain']} - Section {s}", "CNS.EW", 50, [(ew, "SS", 20)], disc="CIV", loc=loc, rate=12000)
        sb = add("CNS", f"{S['subb']} - Section {s}", "CNS.TW", 30, [(ew, "FS", 0), (dr, "FF", 0)], disc="CIV", loc=loc, rate=15000)
        tr = add("CNS", f"{S['track']} - Section {s}", "CNS.TW", 60,
                 [(sb, "FS", 0), (deliv["Rails"], "FS", 0), (deliv["Turnouts"], "FS", 0), (shop, "FS", 0)],
                 disc="TRK", loc=loc, rate=35000)
        bt = add("CNS", f"{S['ballast']} - Section {s}", "CNS.TW", 30, [(tr, "SS", 20), (ball[i], "FS", 0)], disc="TRK", loc=loc, rate=10000)
        track[s] = bt
        ew_done.append(ew)
    add("MIL", "Earthworks Complete" if scheme != "C" else "EW Compl", "MIL", 0, [(e, "FS", 0) for e in ew_done], kind="finish_ms", disc="MGT")
    tlc = add("MIL", "Track Laying Complete" if scheme != "C" else "TRK Compl", "MIL", 0, [(t, "FS", 0) for t in track.values()], kind="finish_ms", disc="MGT")
    stn_done = []
    for st in STATIONS:
        loc = f"STN-{st[0]}"
        fd = add("CNS", f"{S['found']} - {st} Station", "CNS.ST", 40, [(ifc[st], "FS", 0), (conc, "FS", 0)], disc="STN", loc=loc, wp="WP04", rate=20000)
        su = add("CNS", f"{S['struct']} - {st} Station", "CNS.ST", 80, [(fd, "FS", 0), (deliv["Station Steel"], "FS", 0)], disc="STN", loc=loc, wp="WP04", rate=30000)
        ar = add("CNS", f"{S['arch']} - {st} Station", "CNS.ST", 60, [(su, "FS", 0)], disc="STN", loc=loc, wp="WP04", rate=15000)
        me = add("CNS", f"{S['mep']} - {st} Station", "CNS.ST", 60, [(su, "SS", 40)], disc="STN", loc=loc, wp="WP04", rate=18000)
        pf = add("CNS", f"{S['platform']} - {st} Station", "CNS.ST", 30, [(ar, "SS", 20), (me, "FF", 0)], disc="STN", loc=loc, wp="WP04", rate=9000)
        stn_done.append(pf)
    sys_done = []
    for s in SECTIONS:
        loc = f"SEC-{s}"
        oc = add("CNS", f"{S['ocs']} - Section {s}", "CNS.SY", 45, [(track[s], "FS", 0), (deliv["OCS Materials"], "FS", 0)], disc="SYS", loc=loc, con="SC", wp="WP05", rate=22000)
        sg = add("CNS", f"{S['sig']} - Section {s}", "CNS.SY", 50, [(track[s], "SS", 10), (deliv["Signalling Equipment"], "FS", 0)], disc="SYS", loc=loc, con="SC", wp="WP05", rate=25000)
        te = add("CNS", f"{S['tel']} - Section {s}", "CNS.SY", 40, [(track[s], "SS", 10)], disc="SYS", loc=loc, con="SC", wp="WP05", rate=12000)
        sys_done += [oc, sg, te]
    # --- T&C
    tests = []
    for s in SECTIONS:
        tests.append(add("TST", f"{S['systest']} - Section {s}", "TST", 30,
                         [(x, "FS", 0) for x in sys_done if x.startswith(P["CNS"])][SECTIONS.index(s) * 3: SECTIONS.index(s) * 3 + 3],
                         disc="TNC", loc=f"SEC-{s}", con="SC", wp="WP06", rate=9000))
    en = add("TST", S["energ"], "TST", 10, [(t, "FS", 0) for t in tests], disc="TNC", con="SC", wp="WP06", rate=6000)
    syse = add("MIL", "Systems Energized" if scheme != "C" else "Sys Energ", "MIL", 0, [(en, "FS", 0)], kind="finish_ms", disc="MGT")
    it = add("TST", S["integ"], "TST", 40, [(en, "FS", 0)] + [(p, "FS", 0) for p in stn_done], disc="TNC", con="SC", wp="WP06", rate=10000)
    tr = add("TST", S["trial"], "TST", 45, [(it, "FS", 0)], disc="TNC", con="SC", wp="WP06", rate=8000)
    # --- Handover
    ab = add("HND", S["asbuilt"], "HND", 40, [(tlc, "FS", 0)], disc="MGT", con="MC", wp="WP06", rate=3000)
    om = add("HND", S["om"], "HND", 30, [(it, "SS", 10)], disc="MGT", con="SC", wp="WP06", rate=4000)
    pac = add("HND", "Provisional Acceptance (PAC)" if scheme != "C" else "PAC", "HND", 0, [(tr, "FS", 0), (ab, "FS", 0), (om, "FS", 0)], kind="finish_ms", disc="MGT", wp="WP06")
    add("MIL", "Project Completion" if scheme != "C" else "Proj Compl", "MIL", 0, [(pac, "FS", 0), (syse, "FS", 0), (dcomp, "FS", 0)], kind="finish_ms", disc="MGT", wp="WP06")
    types = copy.deepcopy(CODE_TYPES)
    if scheme == "C":
        types = {"DISC": types["Discipline"], "AREA": types["Location"], "SUBCON": types["Contractor"],
                 "PKG": types["Work Package"]}
        rename = {"Discipline": "DISC", "Location": "AREA", "Contractor": "SUBCON", "Work Package": "PKG"}
        for a in acts:
            a.codes = {rename[k]: v for k, v in a.codes.items()}
    return GenProject(f"RAIL-{scheme}", f"Northern Rail Extension ({scheme}) - Demo", date(2025, 1, 5), wbs, acts,
                      types, "sunthu", [date(2025, 3, 30), date(2025, 3, 31), date(2025, 4, 1), date(2025, 6, 6),
                                        date(2025, 6, 8), date(2025, 9, 23), date(2026, 2, 22), date(2026, 3, 19),
                                        date(2026, 3, 22), date(2026, 5, 26), date(2026, 5, 27), date(2026, 9, 23)])


def _current_spec(base: GenProject, scheme: str) -> GenProject:
    """Apply realistic changes between baseline and update."""
    cur = copy.deepcopy(base)
    by = {a.code: a for a in cur.acts}
    S = SCHEMES[scheme]
    # 1) Duration change: earthworks Section B grows
    for a in cur.acts:
        if a.name == f"{S['earth']} - Section B":
            a.dur = 95
    # 2) Rename with new Activity ID (telecom design)
    for a in cur.acts:
        if a.name in (f"Telecom {S['design']}", f"TEL {S['design']}"):
            old = a.code
            a.code = old[:-1] + "5"
            a.name = ("Telecommunications System " + S["design"]) if scheme != "C" else "TEL Sys Dsgn"
            for b in cur.acts:
                b.preds = [(a.code if p == old else p, t, l) for p, t, l in b.preds]
    # 3) Delete ballast batch 3 (its successor now uses batch 2)
    b3 = next(a for a in cur.acts if a.name.endswith("Batch 3"))
    b2 = next(a for a in cur.acts if a.name.endswith("Batch 2"))
    cur.acts.remove(b3)
    for a in cur.acts:
        a.preds = [((b2.code if p == b3.code else p), t, l) for p, t, l in a.preds]
    # 4) Split Central station structure into two parts
    struct = next(a for a in cur.acts if a.name == f"{S['struct']} - Central Station")
    p1 = copy.deepcopy(struct)
    p1.code, p1.name, p1.dur = struct.code[:-1] + "1", struct.name + " - Part 1", 45
    p2 = copy.deepcopy(struct)
    p2.code, p2.name, p2.dur, p2.preds = struct.code[:-1] + "2", struct.name + " - Part 2", 45, [(p1.code, "FS", 0)]
    idx = cur.acts.index(struct)
    cur.acts[idx:idx + 1] = [p1, p2]
    for a in cur.acts:
        a.preds = [((p2.code if p == struct.code else p), t, l) for p, t, l in a.preds]
    # 5) Added activity: additional drainage in Section B
    ewb = next(a for a in cur.acts if a.name == f"{S['earth']} - Section B")
    sbb = next(a for a in cur.acts if a.name == f"{S['subb']} - Section B")
    new = GA(f"{S['prefix']['CNS']}-1995", "Additional Drainage Works - Section B" if scheme != "C" else "Addl Culverts Sec B",
             "CNS.EW", 25, [(ewb.code, "SS", 30)], "task", dict(ewb.codes), 9000)
    cur.acts.insert(cur.acts.index(sbb), new)
    sbb.preds.append((new.code, "FS", 0))
    # 6) Constraint added on trial running (soft)
    return cur


def _factors(proj: GenProject) -> dict:
    f = {}
    for a in proj.acts:
        h = _hash01(a.code)
        if a.wbs.startswith("ENG"):
            f[a.code] = 1.05 + 0.25 * h
        elif a.wbs.startswith("PRC"):
            f[a.code] = 0.95 + 0.30 * h
        elif a.wbs.startswith("CNS"):
            f[a.code] = 0.90 + 0.25 * h
        else:
            f[a.code] = 1.0
    return f


def build_variant(scheme: str = "A", data_date: date = date(2025, 11, 2), *, include_costs: bool = True,
                  include_actual_cost: bool = True, driving_flag: bool = True) -> tuple[str, str]:
    base = _spec(scheme)
    cur = _current_spec(base, scheme)
    cal = WorkCal(base.start, base.workweek, base.holidays)
    dd = cal.idx_on_or_after(data_date)
    planned = baseline_dates(base)
    from .generator import cpm
    _r, bl_end = cpm(base)
    prog = simulate_progress(cur, dd, _factors(cur))
    cost_factor = {a.code: 0.97 + 0.12 * _hash01(a.code + "c") for a in cur.acts}
    bl = build_xer(base, proj_id=100 + ord(scheme), task_base=10000, include_costs=include_costs,
                   include_actual_cost=False, driving_flag=driving_flag)
    cu = build_xer(cur, proj_id=200 + ord(scheme), task_base=50000, data_date_idx=dd, progress=prog,
                   planned=planned, include_costs=include_costs, include_actual_cost=include_actual_cost,
                   cost_factor=cost_factor, driving_flag=driving_flag, must_finish_idx=bl_end)
    return bl, cu


def expected_phases(scheme: str) -> dict[str, str | None]:
    """Ground-truth phase per activity name for tests."""
    cur = _current_spec(_spec(scheme), scheme)
    return {a.name: PHASE_OF_WBS_KEY[a.wbs.split(".")[0]] for a in cur.acts}


def build_demo() -> tuple[str, str]:
    return build_variant("A")
