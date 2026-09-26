"""Text normalization, stemming and fuzzy similarity (offline, no ML models)."""
from __future__ import annotations

import re
from difflib import SequenceMatcher
from functools import lru_cache

try:  # rapidfuzz is optional; difflib fallback keeps the core dependency-free
    from rapidfuzz import fuzz as _rf
except ImportError:  # pragma: no cover
    _rf = None

_SPECIAL = [
    (re.compile(r"\bt\s*&\s*c\b"), " tandc "),
    (re.compile(r"\bm\s*&\s*e\b"), " mande "),
    (re.compile(r"\bo\s*&\s*m\b"), " oandm "),
    (re.compile(r"\be\s*&\s*m\b"), " eandm "),
]
_CAMEL = re.compile(r"(?<=[a-z])(?=[A-Z])")
_ALNUM = re.compile(r"(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])")
_NONWORD = re.compile(r"[^a-z0-9]+")


@lru_cache(maxsize=200_000)
def normalize(text: str) -> str:
    if not text:
        return ""
    s = _CAMEL.sub(" ", text)
    s = _ALNUM.sub(" ", s)
    s = s.lower()
    for pat, rep in _SPECIAL:
        s = pat.sub(rep, s)
    s = s.replace("&", " and ")
    s = _NONWORD.sub(" ", s)
    return " ".join(s.split())


@lru_cache(maxsize=200_000)
def stem(tok: str) -> str:
    if len(tok) <= 3 or tok.isdigit():
        return tok
    for suf, rep in (("ings", ""), ("ing", ""), ("ies", "y"), ("ions", "ion"), ("ed", ""), ("es", "e"), ("s", "")):
        if tok.endswith(suf) and len(tok) - len(suf) >= 3:
            if suf == "s" and tok.endswith("ss"):
                return tok
            return tok[: len(tok) - len(suf)] + rep
    return tok


@lru_cache(maxsize=200_000)
def tokens(text: str) -> tuple[str, ...]:
    return tuple(stem(t) for t in normalize(text).split() if not t.isdigit())


def ratio(a: str, b: str) -> float:
    """Similarity 0..1 between two short strings."""
    if not a or not b:
        return 0.0
    if _rf is not None:
        return _rf.ratio(a, b) / 100.0
    return SequenceMatcher(None, a, b).ratio()


def token_set_similarity(a: str, b: str) -> float:
    """Order-insensitive similarity of two phrases (0..1)."""
    na, nb = normalize(a), normalize(b)
    if not na or not nb:
        return 0.0
    if _rf is not None:
        return _rf.token_set_ratio(na, nb) / 100.0
    ta, tb = set(na.split()), set(nb.split())
    inter = " ".join(sorted(ta & tb))
    ra = " ".join(sorted(ta - tb))
    rb = " ".join(sorted(tb - ta))
    s1 = (inter + " " + ra).strip()
    s2 = (inter + " " + rb).strip()
    return max(SequenceMatcher(None, inter, s1).ratio() if inter else 0.0,
               SequenceMatcher(None, inter, s2).ratio() if inter else 0.0,
               SequenceMatcher(None, s1, s2).ratio())
