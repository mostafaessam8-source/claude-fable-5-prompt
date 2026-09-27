#!/usr/bin/env bash
# Builds and runs the native calculation tests for the portable RM_*.mqh headers.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
INC="$HERE/../MQL4/Include/RecoveryManagerPro"
OUT="${TMPDIR:-/tmp}/rmp_test_calc"
CXX="${CXX:-g++}"
"$CXX" -std=c++17 -Wall -Wextra -Wno-unused-parameter -Wno-unused-result \
   -include "$HERE/mql4_shim.h" -I "$INC" -I "$HERE" \
   "$HERE/test_calc.cpp" -o "$OUT"
"$OUT"
