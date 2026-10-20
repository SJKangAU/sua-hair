#!/usr/bin/env bash
# Full verification for the booking-phases branch under one time zone.
# Usage: TZ=UTC bash docs/test-runs/run-phases.sh utc
tag="$1"
out="docs/test-runs/phases-$tag.txt"
: > "$out"
run() {
  echo "=== $* ===" >> "$out"
  "$@" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' >> "$out"
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
