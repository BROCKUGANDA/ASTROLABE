#!/usr/bin/env bash
# CI/local production smoke test. Asserts behaviour on the BUILT server, not just
# liveness — each check exists because a real defect once passed a green pipeline.
#
#   bash scripts/ci-smoke.sh                 # starts `bun run start`, tests it, stops it
#   bash scripts/ci-smoke.sh http://host:3200  # test an already-running server
set -uo pipefail

BASE="${1:-}"
STARTED=0
LOG=/tmp/astrolabe-smoke-start.log

if [ -z "$BASE" ]; then
  BASE=http://localhost:3000
  bun run start > "$LOG" 2>&1 &
  START_PID=$!
  STARTED=1
  trap 'kill "$START_PID" 2>/dev/null || true; pkill -f "next start" 2>/dev/null || true' EXIT
fi

fail() { echo "SMOKE FAIL: $*"; [ "$STARTED" -eq 1 ] && tail -40 "$LOG"; exit 1; }

echo "Target: $BASE"
curl -fsS --retry 40 --retry-delay 2 --retry-connrefused -o /dev/null "$BASE/api/healthz" \
  || fail "server never answered /api/healthz"

# 1. Liveness
curl -fsS "$BASE/api/healthz" -o /tmp/healthz.json || fail "healthz not 200"
echo "healthz: $(cat /tmp/healthz.json)"

# 2. Readiness must be fully ok: a wrong DATABASE_URL used to pass unnoticed here.
READY=$(curl -fsS "$BASE/api/readyz") || fail "readyz not 200"
echo "readyz: $READY"
echo "$READY" | grep -q '"status":"ok"' || fail "readiness reports degraded"
for check in db corpus map engine; do
  echo "$READY" | grep -q "\"$check\":\"ok\"" || fail "readiness check '$check' is not ok"
done

# 3. The shell must render. A route-level loading boundary once stranded the app
#    behind its own fallback while every endpoint stayed healthy.
PAGE=$(curl -fsS "$BASE/") || fail "root document not served"
echo "$PAGE" | grep -q 'ASTROLABE' || fail "shell missing from server render"
echo "$PAGE" | grep -q 'Loading your journey' && fail "server rendered the loading boundary, not the app"
echo "$PAGE" | grep -q 'id="S:0"' && fail "server emitted an unresolved streaming boundary"
echo "server render: shell present, no stranded boundary."

# 4. Authorization is enforced on the artifact.
ANON=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/journey/me")
[ "$ANON" = "401" ] || fail "expected 401 without a session, got $ANON"

# 5. Sign-in must work in production. A 500 here previously meant the session layer
#    had no secret, and every console then spun on a 401 it never surfaced.
CJ=$(mktemp)
SIGNIN=$(curl -s -c "$CJ" -o /tmp/signin.json -w '%{http_code}' \
  -X POST -H 'content-type: application/json' \
  -d '{"employeeId":"E-1042"}' "$BASE/api/v1/auth/sign-in")
[ "$SIGNIN" = "200" ] || fail "sign-in returned $SIGNIN"
grep -q 'astrolabe_session' "$CJ" || fail "sign-in set no session cookie"

# 6. With that session the employee gets their own verdict.
ME=$(curl -s -b "$CJ" "$BASE/api/v1/journey/me")
echo "$ME" | grep -q '"ok":true' || fail "journey/me rejected a valid session"
echo "$ME" | grep -qE '"band":"(steady|watch|friction|blocked)"' || fail "no band in the journey payload"
echo "session: journey/me served a band for E-1042."

# 7. Privacy boundaries hold in the built server, not just in tests.
FORBID=$(curl -s -o /dev/null -w '%{http_code}' -b "$CJ" "$BASE/api/v1/manager/cohort")
[ "$FORBID" = "403" ] || fail "employee read the manager cohort (got $FORBID, wanted 403)"
SNOOP=$(curl -s -o /dev/null -w '%{http_code}' -b "$CJ" "$BASE/api/v1/me/data?employeeId=E-1047")
[ "$SNOOP" = "403" ] || fail "employee read another employee's subject-access file (got $SNOOP)"
QUEUE=$(curl -s -o /dev/null -w '%{http_code}' -b "$CJ" "$BASE/api/v1/hrbp/queue")
[ "$QUEUE" = "403" ] || fail "employee read the HRBP queue (got $QUEUE)"
echo "authority: manager cohort, cross-employee SAR and HRBP queue all refused."

rm -f "$CJ"
echo "SMOKE PASS on $BASE"
