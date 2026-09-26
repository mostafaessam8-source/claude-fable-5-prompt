"""Mapping profile: keyword dictionary, synonyms, thresholds and user overrides.

A profile is plain JSON so it can be edited in the Settings screen, saved,
and reused on future projects. Nothing in the classifier is hard-coded to a
particular project's WBS or code names.
"""
from __future__ import annotations

import copy
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

PHASES = ["Engineering", "Procurement", "Construction", "Testing & Commissioning", "Handover"]


@dataclass
class Keyword:
    term: str
    weight: float = 1.0
    exact_only: bool = False          # abbreviations: never fuzzy-matched
    suppress_if: list = field(default_factory=list)  # ignore this keyword when any of these words is present


@dataclass
class Category:
    name: str
    keywords: list = field(default_factory=list)
    color: str = "#1F4E79"


def _kw(spec) -> Keyword:
    if isinstance(spec, Keyword):
        return spec
    if isinstance(spec, str):
        return Keyword(spec)
    if isinstance(spec, dict):
        return Keyword(**spec)
    term, weight, *rest = spec
    exact = rest[0] if rest else False
    sup = list(rest[1]) if len(rest) > 1 else []
    return Keyword(term, weight, exact, sup)


DEFAULT_CATEGORIES = {
    "Engineering": ("#2a78d6", [
        ("engineering", 1.0), ("eng", 1.0, True), ("design", 1.0), ("detailed design", 1.2), ("technical", 0.5),
        ("drawing", 0.9), ("shop drawing", 1.2), ("ifc", 1.1, True), ("issued for construction", 1.3),
        ("submittal", 0.5), ("approval", 0.4), ("review", 0.8), ("design review", 1.2), ("design development", 1.2),
        ("design check", 1.2), ("calculation", 0.8), ("specification", 0.7), ("model", 0.4), ("bim", 0.8, True),
    ]),
    "Procurement": ("#eb6834", [
        ("procurement", 1.2), ("purchasing", 1.0), ("purchase", 1.0), ("purchase order", 1.3), ("po", 1.0, True),
        ("material", 0.8, False, ["design", "engineering", "support"]), ("vendor", 0.8), ("supplier", 0.9),
        ("supply", 0.9), ("supply chain", 1.3), ("manufacturing", 1.0), ("fabrication", 0.9), ("fat", 1.2, True),
        ("factory acceptance", 1.3), ("delivery", 0.9), ("long lead", 1.2), ("shipment", 1.0), ("shipping", 1.0),
        ("order placement", 1.2), ("rfq", 1.2, True), ("tender", 0.8), ("arrival on site", 1.2),
        ("site receipt", 1.2), ("mat", 1.0, True), ("lli", 1.0, True), ("bulk", 0.4), ("expediting", 1.0),
        ("prc", 0.8, True), ("proc", 0.8, True),
    ]),
    "Construction": ("#1baf7a", [
        ("construction", 1.2), ("civil", 1.0), ("structural", 0.8), ("earthworks", 1.0), ("earthwork", 1.0),
        ("excavation", 1.0), ("backfill", 1.0), ("concrete", 0.9, False, ["supply", "contract"]),
        ("foundation", 1.0), ("installation", 1.0), ("install", 1.0), ("erection", 1.0),
        ("track", 0.8, False, ["design", "drawing", "supply"]), ("railway", 0.5), ("station", 0.4),
        ("building", 0.7), ("mep", 0.9, True), ("electrical", 0.5), ("mechanical", 0.5), ("architectural", 0.8),
        ("site execution", 1.3), ("formation", 0.8), ("permanent way", 1.3), ("ballast", 0.8, False, ["supply", "batch"]),
        ("piling", 1.0), ("footing", 0.9), ("culvert", 1.0), ("drainage", 0.9), ("subgrade", 1.0),
        ("sub ballast", 1.0), ("tamping", 1.0), ("laying", 0.9), ("fit out", 1.0), ("finishes", 0.8),
        ("platform", 0.6), ("superstructure", 1.0), ("catenary", 1.0), ("mobilization", 1.0), ("mobilisation", 1.0),
        ("cut and fill", 1.2), ("building services", 1.2), ("cns", 0.8, True), ("site", 0.3), ("works", 0.3),
        ("eandm", 0.6, True), ("pour", 0.8), ("rebar", 0.8), ("formwork", 1.0), ("paving", 1.0), ("asphalt", 1.0),
    ]),
    "Testing & Commissioning": ("#eda100", [
        ("testing", 1.0), ("test", 1.0), ("commissioning", 1.2), ("tandc", 1.5, True), ("sat", 1.2, True),
        ("energization", 1.2), ("energisation", 1.2), ("power on", 1.2), ("inspection", 0.6), ("trial", 1.0),
        ("trial running", 1.3), ("trial operation", 1.3), ("integration", 0.9), ("integrated test", 1.3),
        ("system testing", 1.3), ("subsystem", 0.5), ("safety certification", 1.0), ("tc", 1.0, True),
        ("tst", 0.8, True), ("cx", 1.0, True),
    ]),
    "Handover": ("#e87ba4", [
        ("handover", 1.5), ("hand over", 1.5), ("ho", 1.0, True), ("closeout", 1.3), ("close out", 1.3),
        ("completion", 0.5), ("pac", 1.3, True), ("fac", 1.3, True), ("provisional acceptance", 1.3),
        ("final acceptance", 1.3), ("as built", 1.2), ("record drawing", 1.3), ("oandm", 1.2, True),
        ("training", 1.0), ("operator training", 1.2), ("documentation", 0.5), ("hnd", 0.8, True),
        ("snagging", 1.0), ("punch list", 1.2), ("defects", 0.8),
    ]),
}

DEFAULT_SYNONYMS = {
    "dsgn": "design", "rvw": "review", "dwg": "drawing", "dwgs": "drawing", "mfg": "manufacturing",
    "dlvry": "delivery", "shpt": "shipment", "fdn": "foundation", "instl": "installation",
    "constr": "construction", "elec": "electrical", "mech": "mechanical", "arch": "architectural",
    "fin": "finishes", "trng": "training", "compl": "complete", "addl": "additional",
    "comm": "commissioning", "commiss": "commissioning", "procure": "procurement", "subm": "submittal", "appr": "approval", "insp": "inspection",
}

DEFAULT_DIMENSIONS = {
    "Phase": ["phase", "stage", "epc", "project phase"],
    "Discipline": ["discipline", "disc", "trade", "department", "dept", "specialty", "speciality"],
    "Location": ["location", "area", "zone", "section", "site", "loc", "chainage", "station"],
    "Contractor": ["contractor", "subcontractor", "subcon", "company", "responsible", "responsibility", "vendor"],
    "Work Package": ["work package", "package", "pkg", "wp", "contract package", "cwp"],
}

DEFAULT_STAGES = {
    "Procurement": [
        ("Site Receipt", ["site receipt", "receipt", "receiving", "received"]),
        ("Delivery", ["delivery", "arrival on site", "deliver"]),
        ("Shipping", ["shipping", "shipment", "transport", "freight"]),
        ("FAT", ["fat", "factory acceptance"]),
        ("Manufacturing", ["manufacturing", "fabrication", "production"]),
        ("PO", ["purchase order", "po", "order placement", "award"]),
        ("RFQ", ["rfq", "request for quotation", "tender", "bid"]),
        ("Approval", ["approval", "approve"]),
        ("Technical Submittal", ["technical submittal", "tech sub", "submittal", "submission", "vendor data"]),
    ],
    "Engineering": [
        ("Shop Drawings", ["shop drawing", "shop dwg"]),
        ("IFC", ["ifc", "issued for construction"]),
        ("Technical Submittals", ["submittal", "tech sub", "submission"]),
        ("Approval", ["approval", "approve"]),
        ("Review", ["review", "check", "rvw"]),
        ("Design", ["design", "dsgn", "calculation", "drawing"]),
    ],
}

DEFAULT_SIGNAL_WEIGHTS = {
    "manual": 100.0, "name": 2.0, "wbs": 2.5, "wbs_decay": 0.6, "code_phase": 3.5, "code": 1.5,
    "id_prefix": 1.0, "udf": 1.5, "neighbor": 0.8, "evidence_saturation": 3.0, "fuzzy_min_ratio": 0.88,
}


@dataclass
class MappingProfile:
    name: str = "SAR Default Mapping Profile"
    version: int = 1
    categories: list = field(default_factory=list)
    synonyms: dict = field(default_factory=dict)
    dimensions: dict = field(default_factory=dict)
    stages: dict = field(default_factory=dict)
    signal_weights: dict = field(default_factory=dict)
    high_threshold: float = 0.85
    medium_threshold: float = 0.60
    # --- user overrides (reused when a new update XER is imported)
    activity_overrides: dict = field(default_factory=dict)     # Activity ID -> category ("" = force Not Mapped)
    wbs_overrides: dict = field(default_factory=dict)          # WBS code path -> category
    code_value_overrides: dict = field(default_factory=dict)   # "Code Type:Value" -> category
    code_type_dimensions: dict = field(default_factory=dict)   # Code type name -> dimension ("" = ignore)
    match_overrides: dict = field(default_factory=dict)        # current Activity ID -> baseline Activity ID ("" = unmatched)

    # ------------------------------------------------------------------
    @property
    def category_names(self) -> list[str]:
        return [c.name for c in self.categories]

    def color(self, category: str | None) -> str:
        for c in self.categories:
            if c.name == category:
                return c.color
        return "#7F8C8D"

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)

    @classmethod
    def from_dict(cls, d: dict) -> "MappingProfile":
        d = copy.deepcopy(d)
        cats = [Category(c["name"], [_kw(k) for k in c.get("keywords", [])], c.get("color", "#1F4E79"))
                for c in d.pop("categories", [])]
        known = {f for f in cls.__dataclass_fields__}
        p = cls(**{k: v for k, v in d.items() if k in known})
        p.categories = cats
        base = default_profile(with_overrides=False)
        # fill anything missing from older profile versions
        for attr in ("synonyms", "dimensions", "stages", "signal_weights"):
            cur = getattr(p, attr)
            for k, v in getattr(base, attr).items():
                cur.setdefault(k, v)
        if not p.categories:
            p.categories = base.categories
        return p

    @classmethod
    def from_json(cls, text: str) -> "MappingProfile":
        return cls.from_dict(json.loads(text))

    def save(self, path: str | Path) -> None:
        Path(path).write_text(self.to_json(), encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> "MappingProfile":
        return cls.from_json(Path(path).read_text(encoding="utf-8"))

    def copy(self) -> "MappingProfile":
        return MappingProfile.from_dict(self.to_dict())

    # --------------------------------------------------------- editing API
    def category(self, name: str) -> Category | None:
        return next((c for c in self.categories if c.name == name), None)

    def add_category(self, name: str, color: str = "#34495E") -> Category:
        c = self.category(name)
        if c is None:
            c = Category(name, [], color)
            self.categories.append(c)
        return c

    def add_keyword(self, category: str, term: str, weight: float = 1.0, exact_only: bool = False,
                    suppress_if: list | None = None) -> None:
        c = self.add_category(category)
        c.keywords = [k for k in c.keywords if k.term.lower() != term.lower()]
        c.keywords.append(Keyword(term, weight, exact_only, list(suppress_if or [])))

    def remove_keyword(self, category: str, term: str) -> None:
        c = self.category(category)
        if c:
            c.keywords = [k for k in c.keywords if k.term.lower() != term.lower()]


def default_profile(with_overrides: bool = True) -> MappingProfile:
    cats = [Category(name, [_kw(k) for k in kws], color) for name, (color, kws) in DEFAULT_CATEGORIES.items()]
    return MappingProfile(
        categories=cats,
        synonyms=dict(DEFAULT_SYNONYMS),
        dimensions={k: list(v) for k, v in DEFAULT_DIMENSIONS.items()},
        stages={k: [[n, list(t)] for n, t in v] for k, v in DEFAULT_STAGES.items()},
        signal_weights=dict(DEFAULT_SIGNAL_WEIGHTS),
    )
