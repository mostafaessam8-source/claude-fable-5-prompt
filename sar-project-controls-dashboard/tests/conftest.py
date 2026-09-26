import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sar_pcd.analysis.settings import AnalysisSettings  # noqa: E402
from sar_pcd.core.loader import load_schedule  # noqa: E402
from sar_pcd.core.xer_parser import parse_xer  # noqa: E402
from sar_pcd.demo.generator import GA, GenProject, build_xer  # noqa: E402
from sar_pcd.demo.rail_demo import build_variant  # noqa: E402
from sar_pcd.mapping.profile import default_profile  # noqa: E402
from sar_pcd.services.pipeline import build_context  # noqa: E402


def load_text(text: str, name: str = "t.xer"):
    return load_schedule(parse_xer(text.encode("cp1252"), name))


@pytest.fixture(scope="session")
def variants():
    return {k: build_variant(k) for k in "ABC"}


@pytest.fixture(scope="session")
def demo_ctx(variants):
    bl, cu = variants["A"]
    return build_context(load_text(bl, "bl.xer"), load_text(cu, "cu.xer"), default_profile(), AnalysisSettings())


def small_project(rate_a=1000.0, rate_b=3000.0) -> GenProject:
    """Start MS -> A (10d) -> B (10d) -> Finish MS on a Mon-Fri calendar."""
    acts = [
        GA("MS-1", "Project Start", "MIL", 0, [], "start_ms"),
        GA("A-1", "Excavation Works", "CNS", 10, [("MS-1", "FS", 0)], rate=rate_a),
        GA("B-1", "Concrete Foundation Works", "CNS", 10, [("A-1", "FS", 0)], rate=rate_b),
        GA("MS-2", "Project Finish", "MIL", 0, [("B-1", "FS", 0)], "finish_ms"),
    ]
    wbs = [("MIL", None, "0", "Milestones"), ("CNS", None, "1", "Construction")]
    return GenProject("SMALL", "Small Test Project", date(2025, 1, 6), wbs, acts, {}, "monfri", [], "CP_Phys")


@pytest.fixture
def small():
    def make(progress=None, dd=0, include_actual_cost=True, rate_a=1000.0, rate_b=3000.0, cost_factor=None,
             driving_flag=True):
        p = small_project(rate_a, rate_b)
        bl = build_xer(p, proj_id=1, task_base=100, include_actual_cost=False, driving_flag=driving_flag)
        cu = build_xer(p, proj_id=2, task_base=500, data_date_idx=dd, progress=progress,
                       include_actual_cost=include_actual_cost, cost_factor=cost_factor, driving_flag=driving_flag)
        return build_context(load_text(bl), load_text(cu), default_profile(), AnalysisSettings())
    return make
