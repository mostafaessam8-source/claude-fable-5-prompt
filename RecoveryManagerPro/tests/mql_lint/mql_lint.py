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
if "--main" in sys.argv:        # e.g. --main MQL4/Experts/RecoveryManagerPro_Standalone.mq4
    MAIN = os.path.abspath(sys.argv[sys.argv.index("--main") + 1])

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
                out.append(line.rstrip("\r\n"))
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
    if "//@@PROTOTYPES@@" not in src:
        # standalone build: declare everything right after the inlined globals section
        banner = "//==== inlined: Include/RecoveryManagerPro/RM_Log.mqh"
        src = src.replace(banner, "//@@PROTOTYPES@@\n" + banner, 1)
    src = src.replace("//@@PROTOTYPES@@", prototypes(src))
    shim = os.path.join(ROOT, "tests", "mql4_shim.h")
    return f'#include "{api_header}"\n#include "{shim}"\n' + src + "\n" + extra


def preset_code():
    """C++ that applies each MQL4/Presets/*.set to the EA inputs, validates it and runs
    a short one-losing-order scenario in the simulator."""
    pdir = os.path.join(ROOT, "MQL4", "Presets")
    types = dict((n, t) for t, n in re.findall(r"^(?:input|ADV)\s+(\w+)\s+(Inp\w+)", open(MAIN).read(), re.M))
    funcs, calls = [], []
    for i, name in enumerate(sorted(os.listdir(pdir))):
        if not name.endswith(".set"):
            continue
        lines = []
        seen_keys = set()
        for raw in open(os.path.join(pdir, name)):
            k0 = raw.split("=", 1)[0].strip()
            if "=" in raw and not raw.startswith(";"):
                if k0 in seen_keys:
                    raise SystemExit(f"{name}: duplicate key {k0}")
                seen_keys.add(k0)
        missing = set(re.findall(r"^(?:input|ADV)\s+\w+\s+(Inp\w+)", open(MAIN).read(), re.M)) - seen_keys
        if missing:
            raise SystemExit(f"{name}: missing inputs {sorted(missing)}")
        for raw in open(os.path.join(pdir, name)):
            raw = raw.strip()
            if not raw or raw.startswith(";") or "=" not in raw:
                continue
            k, v = raw.split("=", 1)
            if types.get(k) != "string":
                lines.append(f"   {k} = (decltype({k}))({v});")
            else:
                lines.append(f'   {k} = "{v}";')
        funcs.append(f"static void Apply{i}()\n  {{\n" + "\n".join(lines) + "\n  }")
        calls.append((name, f"Apply{i}"))
    body = "\n".join(funcs) + "\n#include <sys/stat.h>\nint main(int argc, char **argv)\n  {\n"
    body += "   int which = argc > 1 ? std::atoi(argv[1]) : -1; int rc = 0;\n"
    for idx, (name, fn) in enumerate(calls):
        body += f"""   if(which == {idx})
     {{
      {fn}();
      string err = "";
      bool ok = RM_ValidateInputs(err);
      S.fileDir = "/tmp/rmp_preset_{idx}"; mkdir(S.fileDir.c_str(), 0777);
      SimRecordBar();
      bool init = ok && OnInit() == INIT_SUCCEEDED;
      SimOpen(OP_BUY, 0.10, 0, "manual");
      for(int t = 0; t < 300; t++) {{ S.now += 600; S.bid -= 0.00002; SimRecordBar(); OnTick(); }}
      std::printf("%-24s validate=%s init=%s state=%s managed=%d lock=%.2f recovery=%d %s\\n", "{name}",
                  ok ? "ok" : err.c_str(), init ? "ok" : "FAIL", RM_StateName(g_state).c_str(), g_tot.totalCnt,
                  g_tot.lockLots, g_tot.recBuyCnt + g_tot.recSellCnt, g_status.c_str());
      rc = (ok && init && g_state != RM_ST_ERROR_HOLD) ? 0 : 1;
     }}
"""
    body += "   if(which < 0) std::printf(\"%d\\n\", " + str(len(calls)) + ");\n   return rc;\n  }\n"
    return body


def main():
    cxx = os.environ.get("CXX", "g++")
    flags = ["-std=c++17", "-Wall", "-Wno-unused-variable", "-Wno-unused-but-set-variable",
             "-Wno-unused-function", "-Wno-sign-compare"]
    if "--presets" in sys.argv:
        tu = build_tu(os.path.join(HERE, "mt4_sim.h"), preset_code())
        fd, tmp = tempfile.mkstemp(suffix=".cpp")
        with os.fdopen(fd, "w") as f:
            f.write(tu)
        exe = tmp[:-4]
        r = subprocess.run([cxx] + flags + ["-O1", "-o", exe, tmp], capture_output=True, text=True)
        sys.stderr.write(r.stderr)
        if r.returncode != 0:
            print("preset build: ERRORS (translation unit kept at", tmp + ")")
            return 1
        n = int(subprocess.run([exe], capture_output=True, text=True).stdout.strip())
        bad = 0
        for i in range(n):
            p = subprocess.run([exe, str(i)], capture_output=True, text=True)
            sys.stdout.write(p.stdout)
            bad += (p.returncode != 0)
        os.unlink(tmp)
        os.unlink(exe)
        print(f"presets: {n - bad}/{n} valid")
        return 1 if bad else 0
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
