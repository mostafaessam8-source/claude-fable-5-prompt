#!/usr/bin/env python3
"""The EA's built-in input defaults must equal MQL4/Presets/Three_MA_With_Recovery.set."""
import os, re, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
src = open(os.path.join(ROOT, "MQL4/Experts/RecoveryManagerPro.mq4")).read()
enum = {}
for f in ["RM_Types.mqh", "RM_Distance.mqh"]:
    for body in re.findall(r'enum\s+\w+\s*\{([^}]*)\}', open(os.path.join(ROOT, "MQL4/Include/RecoveryManagerPro", f)).read()):
        enum.update(dict(re.findall(r'(RM_\w+)\s*=\s*(\d+)', body)))
enum.update({'PERIOD_CURRENT': '0', 'MODE_SMA': '0', 'MODE_EMA': '1', 'MODE_SMMA': '2', 'MODE_LWMA': '3',
             'PRICE_CLOSE': '0', 'true': '1', 'false': '0'})
preset = dict(l.strip().split('=', 1) for l in open(os.path.join(ROOT, "MQL4/Presets/Three_MA_With_Recovery.set"))
              if '=' in l and not l.startswith(';'))
bad = []
for t, n, d in re.findall(r'^(?:input|ADV)\s+(\w+)\s+(Inp\w+)\s*=\s*([^;]+);', src, re.M):
    d = d.strip(); cur = enum.get(d, d.strip('"')); pv = preset.get(n)
    try:
        same = float(cur) == float(pv)
    except (TypeError, ValueError):
        same = cur == pv
    if not same:
        bad.append(f"{n}: default {d} vs preset {pv}")
print("defaults == Three_MA_With_Recovery.set:", "OK" if not bad else "MISMATCH")
for b in bad:
    print("  ", b)
sys.exit(1 if bad else 0)
