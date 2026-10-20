#!/usr/bin/env bash
# Full verification under one time zone: build, unit, rules, security, admin,
# smoke and e2e. Usage: TZ=UTC bash docs/test-runs/run-suite.sh <prefix> <tag>
# writes docs/test-runs/<prefix>-<tag>.txt
out="docs/test-runs/$1-$2.txt"
: > "$out"
run() {
  echo "=== $* ===" >> "$out"
  "$@" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -v '^\[WebServer\]' >> "$out"
  echo "EXIT ${PIPESTATUS[0]}" >> "$out"
}
echo "TZ=$TZ" >> "$out"
run npm run build
run npm run test:unit
run npm run test:rules
run npm run test:security
run npm run test:admin
run npm run test:smoke
run npm run test:e2e
echo "FINISHED" >> "$out"
