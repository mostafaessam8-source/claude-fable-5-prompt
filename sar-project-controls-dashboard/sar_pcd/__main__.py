"""Entry point.

    SAR_Project_Controls_Dashboard.exe                 -> desktop application
    ... analyze --baseline BL.xer --current CU.xer [--pdf out.pdf] [--pdf-full full.pdf]
                [--excel out.xlsx] [--png dash.png] [--risks register.xlsx] [--size A3|A4]
    ... demo --out FOLDER                              -> writes demo XERs + sample risk register
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


def _write_demo(out: Path) -> None:
    from .demo.rail_demo import build_demo
    out.mkdir(parents=True, exist_ok=True)
    bl, cu = build_demo()
    (out / "Demo_Baseline_Rev0.xer").write_bytes(bl.encode("cp1252"))
    (out / "Demo_Update_2025-11.xer").write_bytes(cu.encode("cp1252"))
    (out / "Demo_Risk_Register.csv").write_text(DEMO_RISKS, encoding="utf-8")
    print(f"Demo files written to {out}")


DEMO_RISKS = """Risk ID,Title,Probability,Impact,Owner,Status,Category,Activity ID,Response
R-001,Late delivery of rails from overseas mill,4,5,Procurement Manager,Open,Procurement,PRC-1070,Second supplier qualified; expedite FAT
R-002,Unforeseen ground conditions in Section B,3,4,Construction Manager,Open,Construction,CNS-1080,Additional boreholes; contingency drainage design
R-003,Signalling interface design approval delay,4,4,Engineering Manager,Open,Engineering,ENG-1190,Weekly interface workshops with operator
R-004,Heat restrictions on concrete pours (summer),3,3,Site Manager,Open,Construction,,Night pours and retarders
R-005,Station steel fabrication capacity,2,4,Procurement Manager,Open,Procurement,PRC-1250,Split order across two fabricators
R-006,Power supply for energization not ready,2,5,Systems Manager,Open,T&C,TST-1040,Temporary supply arrangement
R-007,Permit delays for utility diversions,3,2,Interface Manager,Open,Construction,,Early engagement with authorities
R-008,Key staff turnover,2,2,HR,Open,Management,,Retention plan
R-009,Currency fluctuation on imported equipment,3,3,Commercial Manager,Open,Cost,,Hedging
R-010,Ballast quarry output shortfall,1,3,Procurement Manager,Closed,Procurement,PRC-1370,Alternative quarry approved
"""


def analyze(args) -> int:
    from .analysis.risk import load_register
    from .analysis.settings import AnalysisSettings
    from .mapping.profile import MappingProfile, default_profile
    from .services.dashboard import ContextCache, build
    from .services.pipeline import read_xer, run_import

    bl = read_xer(args.baseline)
    cu = read_xer(args.current)
    profile = MappingProfile.load(args.profile) if args.profile else default_profile()
    ctx = run_import(bl, cu, args.baseline_project, args.current_project, profile, AnalysisSettings(),
                     lambda p, m: print(f"[{p:3d}%] {m}"))[2]
    risks, src = ([], "")
    if args.risks:
        risks, warns = load_register(args.risks)
        src = Path(args.risks).name
        for w in warns:
            print("Risk register:", w)
    d = build(ctx, risks=risks, risk_source=src)
    cache = ContextCache(ctx)
    for k, v in d.kpis.items():
        print(f"{v.title:28s} {v.display}")
    findings, score = cache.validation
    print(f"Data quality score {score}; {len(findings)} findings")
    if args.pdf:
        from .reporting.pdf import executive_pdf
        executive_pdf(args.pdf, d, args.size)
        print("Wrote", args.pdf)
    if args.pdf_full:
        from .reporting.pdf import full_pdf
        full_pdf(args.pdf_full, d, cache, args.size)
        print("Wrote", args.pdf_full)
    if args.excel:
        from .reporting.excel import export_detailed
        export_detailed(args.excel, d, cache)
        print("Wrote", args.excel)
    if args.png:
        from .reporting.dashboard_image import save_png
        save_png(d, args.png)
        print("Wrote", args.png)
    return 0


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] not in ("analyze", "demo", "--help", "-h", "--version"):
        from .ui.app import run
        return run(argv)
    ap = argparse.ArgumentParser(prog="SAR_Project_Controls_Dashboard")
    ap.add_argument("--version", action="store_true")
    sub = ap.add_subparsers(dest="cmd")
    a = sub.add_parser("analyze", help="Analyze two XER files without the GUI")
    a.add_argument("--baseline", required=True)
    a.add_argument("--current", required=True)
    a.add_argument("--baseline-project")
    a.add_argument("--current-project")
    a.add_argument("--profile", help="Mapping profile JSON")
    a.add_argument("--risks", help="Risk register (CSV/XLSX)")
    a.add_argument("--pdf")
    a.add_argument("--pdf-full")
    a.add_argument("--excel")
    a.add_argument("--png")
    a.add_argument("--size", default="A3", choices=["A3", "A4"])
    dm = sub.add_parser("demo", help="Write demonstration XER files")
    dm.add_argument("--out", default="demo")
    args = ap.parse_args(argv)
    if args.version:
        from . import __version__
        print(__version__)
        return 0
    if args.cmd == "analyze":
        return analyze(args)
    if args.cmd == "demo":
        _write_demo(Path(args.out))
        return 0
    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
