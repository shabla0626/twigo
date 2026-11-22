#!/usr/bin/env bash
# DIAGNOSTIC: runs the whole browser-test suite N times in a row against the SAME production
# build (no rebuild), and prints one line per run. Used for finding P3-22 ("10 consecutive passes").
#
#   bash scripts/audit/e2e-repeat.sh 10
#
# Each run starts its own server and resets only the cowork_e2e database.
# When a run fails, its traces and screenshots are kept in test-results-failed-<run>/ .
n="${1:-10}"
pass=0
for i in $(seq 1 "$n"); do
  start=$(date +%s)
  out=$(E2E_SKIP_BUILD=1 npx playwright test 2>&1)
  secs=$(( $(date +%s) - start ))
  if echo "$out" | tail -8 | grep -q "failed\|did not run\|Error:"; then
    echo "run $i: FAILED after ${secs}s"
    rm -rf "test-results-failed-$i"
    cp -r test-results "test-results-failed-$i" 2>/dev/null
    echo "$out" | grep -A14 "Error:" | head -40 | sed 's/^/    /'
    echo "$out" | tail -6 | sed 's/^/    /'
  else
    pass=$((pass + 1))
    echo "run $i: $(echo "$out" | grep -o '[0-9]* passed' | tail -1) in ${secs}s"
  fi
done
echo "RESULT: $pass of $n runs passed"
