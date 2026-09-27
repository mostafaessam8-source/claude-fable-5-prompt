#!/usr/bin/env python3
"""Builds MQL4/Experts/RecoveryManagerPro_Standalone.mq4: the EA with every
RecoveryManagerPro/*.mqh inlined, so it compiles in MetaEditor without the
MQL4/Include/RecoveryManagerPro folder. Include guards are removed (one file,
one definition of everything). Source of truth stays the modular files."""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
INC = os.path.join(ROOT, "MQL4", "Include")
MAIN = os.path.join(ROOT, "MQL4", "Experts", "RecoveryManagerPro.mq4")
OUT = os.path.join(ROOT, "MQL4", "Experts", "RecoveryManagerPro_Standalone.mq4")

seen = set()


def strip_guard(lines):
    # remove "#ifndef X_MQH / #define X_MQH ... #endif" wrapping a header
    idx = [i for i, l in enumerate(lines) if re.match(r"\s*#ifndef\s+RM_\w+_MQH", l)]
    if not idx:
        return lines
    i = idx[0]
    if i + 1 < len(lines) and re.match(r"\s*#define\s+RM_\w+_MQH", lines[i + 1]):
        last = max(k for k, l in enumerate(lines) if re.match(r"\s*#endif", l))
        return lines[:i] + lines[i + 2:last] + lines[last + 1:]
    return lines


def inline(path, is_header):
    path = os.path.abspath(path)
    if path in seen:
        return []
    seen.add(path)
    with open(path) as f:
        lines = f.read().split("\n")
    if is_header:
        lines = strip_guard(lines)
    out = []
    if is_header:
        out.append("//==== inlined: " + os.path.relpath(path, os.path.join(ROOT, "MQL4")).replace(os.sep, "/"))
    for line in lines:
        m = re.match(r'\s*#include\s+<(RecoveryManagerPro/[^>]+)>', line)
        q = re.match(r'\s*#include\s+"([^"]+)"', line)
        if m:
            out += inline(os.path.join(INC, m.group(1)), True)
        elif q:
            out += inline(os.path.join(os.path.dirname(path), q.group(1)), True)
        else:
            out.append(line)
    return out


def main():
    lines = inline(MAIN, False)
    header = [
        "//+------------------------------------------------------------------+",
        "//| RecoveryManagerPro_Standalone.mq4 - GENERATED single-file build   |",
        "//| Compiles without MQL4/Include/RecoveryManagerPro. Do not edit:     |",
        "//| regenerate with tests/build_single_file.py from the modular files.|",
        "//+------------------------------------------------------------------+",
    ]
    text = "\n".join(header + lines).rstrip() + "\n"
    text = text.replace("\n", "\r\n")          # MetaEditor-friendly line endings
    with open(OUT, "w", newline="") as f:
        f.write(text)
    print("written", os.path.relpath(OUT, ROOT), text.count("\n"), "lines")


if __name__ == "__main__":
    main()
