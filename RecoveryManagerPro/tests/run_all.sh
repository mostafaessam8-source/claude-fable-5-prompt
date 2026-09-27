#!/usr/bin/env bash
# Runs every automated check available without MetaTrader:
#  1. calculation tests of the portable pure-logic headers
#  2. C++ syntax/consistency lint of the whole EA (declared MT4 API stub)
#  3. end-to-end scenarios: the EA source against an in-memory broker
#  4. preset validation: each .set file through the EA's own validation + a short run
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
rc=0
echo "== 1. calculation tests";  "$HERE/run_tests.sh" | tail -n 1 || rc=1
echo "== 2. MQL4 lint (g++ -fsyntax-only)"; python3 "$HERE/mql_lint/mql_lint.py" || rc=1
echo "== 3. simulator scenarios"; python3 "$HERE/mql_lint/mql_lint.py" --sim "$HERE/test_engine_sim.cpp" || rc=1
echo "== 4. presets"; python3 "$HERE/mql_lint/mql_lint.py" --presets || rc=1
exit $rc
