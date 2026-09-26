"""Safe JSON (de)serialization of the normalized schedule model.

JSON is used instead of pickle so that opening a workspace file received from
someone else can never execute code.
"""
from __future__ import annotations

import dataclasses
import json
import zlib
from datetime import date, datetime

from ..core import model

_REGISTRY = {c.__name__: c for c in (model.Calendar, model.WBS, model.CodeType, model.CodeValue, model.UdfType,
                                     model.Relationship, model.Activity, model.ProjectInfo, model.Schedule)}


def _enc(o):
    if dataclasses.is_dataclass(o) and not isinstance(o, type):
        d = {"__c": type(o).__name__}
        for f in dataclasses.fields(o):
            d[f.name] = _enc(getattr(o, f.name))
        return d
    if isinstance(o, datetime):
        return {"__dt": o.isoformat()}
    if isinstance(o, date):
        return {"__d": o.isoformat()}
    if isinstance(o, (set, frozenset)):
        return {"__s": [_enc(x) for x in o]}
    if isinstance(o, dict):
        return {str(k): _enc(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_enc(x) for x in o]
    return o


def _dec(o):
    if isinstance(o, dict):
        if "__dt" in o:
            return datetime.fromisoformat(o["__dt"])
        if "__d" in o:
            return date.fromisoformat(o["__d"])
        if "__s" in o:
            return {_dec(x) for x in o["__s"]}
        if "__c" in o:
            cls = _REGISTRY.get(o["__c"])
            if cls is None:
                raise ValueError(f"Unknown type in workspace: {o['__c']}")
            kwargs = {k: _dec(v) for k, v in o.items() if k != "__c"}
            names = {f.name for f in dataclasses.fields(cls)}
            return cls(**{k: v for k, v in kwargs.items() if k in names})
        return {k: _dec(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_dec(x) for x in o]
    return o


def schedule_to_bytes(s: model.Schedule) -> bytes:
    return zlib.compress(json.dumps(_enc(s), separators=(",", ":")).encode("utf-8"), 6)


def schedule_from_bytes(b: bytes) -> model.Schedule:
    return _dec(json.loads(zlib.decompress(b).decode("utf-8")))
