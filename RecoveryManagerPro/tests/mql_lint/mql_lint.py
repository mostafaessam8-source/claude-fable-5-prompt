#!/usr/bin/env python3
"""mql_lint.py - approximate syntax/consistency check of the Recovery Manager Pro
EA with a C++ compiler (g++ -fsyntax-only).

It inlines RecoveryManagerPro.mq4 and every included .mqh, rewrites the MQL-only
constructs that C++ lacks (array reference parameters, dynamic arrays, colour
literals, 'input', string #defines, calls to functions defined later) and
compiles the result against tests/mql_lint/mt4_api_stub.h, which only DECLARES
the MT4 API subset used.

Limitations: this is not MetaEditor. It cannot prove MQL4 acceptance (e.g.
MQL-specific implicit conversions or API signatures); it catches undeclared
identifiers, typos, wrong argument counts and gross type errors in our code.
"""
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
INC = os.path.join(ROOT, "MQL4", "Include")
MAIN = os.path.join(ROOT, "MQL4", "Experts", "RecoveryManagerPro.mq4")

seen = set()


def inline(path):
    path = os.path.abspath(path)
    if path in seen:
        return ""
    seen.add(path)
    out = [f"// ---- {os.path.relpath(path, ROOT)}"]
    with open(path) as f:
        for line in f:
            m = re.match(r'\s*#include\s+<(RecoveryManagerPro/[^>]+)>', line)
            q = re.match(r'\s*#include\s+"([^"]+)"', line)
            if m:
                out.append(inline(os.path.join(INC, m.group(1))))
            elif q:
                out.append(inline(os.path.join(os.path.dirname(path), q.group(1))))
            elif re.match(r'\s*#include\s+<stdlib.mqh>', line) or re.match(r'\s*#property\b', line):
                continue
            else:
                out.append(line.rstrip("\n"))
        if path.endswith("RM_Globals.mqh"):
            out.append("//@@PROTOTYPES@@")
    return "\n".join(out)


def transform(src):
    src = re.sub(r"C'(\d+),(\d+),(\d+)'", r"RGBc(\1,\2,\3)", src)
    src = re.sub(r'^\s*input\s+', '', src, flags=re.M)
    # string macros -> constants (MQL allows "a" + "b"; C++ does not)
    src = re.sub(r'^#define\s+(\w+)\s+("[^"]*")\s*$', r'static const string \1 = string(\2);', src, flags=re.M)
    # array reference params: [const] T &name[]  -> [const] MqlArray<T> &name
    src = re.sub(r'(\bconst\s+)?\b(\w+)\s*&\s*(\w+)\s*\[\s*\]', r'\1MqlArray<\2> &\3', src)
    # dynamic arrays (optionally initialised)
    src = re.sub(r'^(\s*)(string|int|double|long|bool)\s+(\w+)\[\]\s*=\s*\{', r'\1MqlArray<\2> \3 = {', src, flags=re.M)
    src = re.sub(r'^(\s*)(string|int|double|long|bool)\s+(\w+)\[\]\s*;', r'\1MqlArray<\2> \3;', src, flags=re.M)
    return src


def prototypes(src):
    protos = []
    pat = re.compile(r'^([A-Za-z_][\w<>]*)\s+([A-Za-z_]\w*)\(([^;{}()]*)\)\s*\n\s*\{', re.M)
    for m in pat.finditer(src):
        ret, name, params = m.group(1), m.group(2), " ".join(m.group(3).split())
        if ret in ("return", "else", "if", "while", "for", "switch", "struct"):
            continue
        protos.append(f"{ret} {name}({params});")
    return "\n".join(protos)


def build_tu(api_header, extra=""):
    src = transform(inline(MAIN))
    src = src.replace("//@@PROTOTYPES@@", prototypes(src))
    shim = os.path.join(ROOT, "tests", "mql4_shim.h")
    return f'#include "{api_header}"\n#include "{shim}"\n' + src + "\n" + extra


def main():
    cxx = os.environ.get("CXX", "g++")
    flags = ["-std=c++17", "-Wall", "-Wno-unused-variable", "-Wno-unused-but-set-variable",
             "-Wno-unused-function", "-Wno-sign-compare"]
    if "--sim" in sys.argv:
        # build and run the end-to-end scenarios against the in-memory broker
        test = os.path.abspath(sys.argv[sys.argv.index("--sim") + 1])
        with open(test) as f:
            tu = build_tu(os.path.join(HERE, "mt4_sim.h"), f.read())
        fd, tmp = tempfile.mkstemp(suffix=".cpp")
        with os.fdopen(fd, "w") as f:
            f.write(tu)
        exe = tmp[:-4]
        r = subprocess.run([cxx] + flags + ["-O1", "-o", exe, tmp], capture_output=True, text=True)
        sys.stderr.write(r.stderr)
        if r.returncode != 0:
            print("sim build: ERRORS (translation unit kept at", tmp + ")")
            return 1
        n = int(subprocess.run([exe], capture_output=True, text=True).stdout.strip())
        failed = 0
        for i in range(n):
            args = [exe, str(i)] + (["v"] if "--verbose" in sys.argv else [])
            p = subprocess.run(args, capture_output=True, text=True)
            sys.stdout.write(p.stdout)
            if p.returncode != 0:
                failed += 1
                sys.stdout.write(p.stderr)
        if "--keep" in sys.argv:
            print("binary:", exe)
        else:
            os.unlink(exe)
        os.unlink(tmp)
        print(f"sim scenarios: {n - failed}/{n} passed")
        return 1 if failed else 0
    tu = build_tu(os.path.join(HERE, "mt4_api_stub.h"))
    fd, tmp = tempfile.mkstemp(suffix=".cpp")
    with os.fdopen(fd, "w") as f:
        f.write(tu)
    r = subprocess.run([cxx] + flags + ["-fsyntax-only", tmp], capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    if "--keep" in sys.argv:
        print("translation unit:", tmp)
    else:
        os.unlink(tmp)
    print("mql_lint:", "OK" if r.returncode == 0 else "ERRORS")
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
