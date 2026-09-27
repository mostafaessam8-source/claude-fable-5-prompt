#!/usr/bin/env python3
"""Writes MQL4/Presets/Three_MA_With_Recovery.set from the EA's built-in defaults
(visible inputs first, then the advanced ones), so the preset can never drift."""
import os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
src = open(os.path.join(ROOT, "MQL4/Experts/RecoveryManagerPro.mq4")).read()
enum = {}
for f in ["RM_Types.mqh", "RM_Distance.mqh"]:
    for body in re.findall(r'enum\s+\w+\s*\{([^}]*)\}', open(os.path.join(ROOT, "MQL4/Include/RecoveryManagerPro", f)).read()):
        enum.update(dict(re.findall(r'(RM_\w+)\s*=\s*(\d+)', body)))
enum.update({'PERIOD_CURRENT': '0', 'MODE_SMA': '0', 'MODE_EMA': '1', 'MODE_SMMA': '2', 'MODE_LWMA': '3',
             'PRICE_CLOSE': '0', 'true': '1', 'false': '0'})
vis, adv = [], []
for kind, n, d in re.findall(r'^(input|ADV)\s+\w+\s+(Inp\w+)\s*=\s*([^;]+);', src, re.M):
    d = d.strip()
    (vis if kind == "input" else adv).append(f"{n}={enum.get(d, d.strip(chr(34)))}")
out = ["; Recovery Manager Pro - Three_MA_With_Recovery.set = the EA's built-in defaults.",
       "; Not a trading recommendation and not a profit guarantee. Test on a demo account first.",
       "; Advanced keys take effect only in a build compiled with #define RMP_SHOW_ADVANCED.",
       "; If your terminal rejects comment lines, delete the lines starting with ';'.",
       ";", "; ---- visible settings"] + vis + [";", "; ---- advanced settings"] + adv
open(os.path.join(ROOT, "MQL4/Presets/Three_MA_With_Recovery.set"), "w").write("\n".join(out) + "\n")
print(f"Three_MA_With_Recovery.set: {len(vis)} visible + {len(adv)} advanced keys")
