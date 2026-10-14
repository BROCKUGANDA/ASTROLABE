#!/usr/bin/env bash
# CI/local bundle secret scan. Checks the EMITTED artifact, so it catches a leak
# from any route or component, not only the file someone was editing.
#
# Usage: bash scripts/ci-bundle-scan.sh [dir ...]   (default: .next/static .next/server/app)
set -uo pipefail

TARGETS=("$@")
if [ "${#TARGETS[@]}" -eq 0 ]; then
  TARGETS=(.next/static .next/server/app)
fi

MISSING=0
for t in "${TARGETS[@]}"; do
  if [ ! -e "$t" ]; then echo "scan target does not exist: $t (run bun run build first)"; MISSING=1; fi
done
[ "$MISSING" -eq 0 ] || exit 1

fail=0
for pattern in 'SESSION_SECRET' 'ASTROLABE_ADMIN_TOKEN' 'ASTROLABE_JUDGE_KEY' \
               'astrolabe-local-development-secret' 'ci-only-throwaway-session-secret' \
               'sk-[A-Za-z0-9]\{12,\}' 'ghp_[A-Za-z0-9]\{20,\}' 'AKIA[0-9A-Z]\{16\}' \
               'BEGIN [A-Z ]*PRIVATE KEY'; do
  if grep -rq -- "$pattern" "${TARGETS[@]}" 2>/dev/null; then
    echo "SECURE PATTERN FOUND IN SHIPPED OUTPUT: $pattern"
    grep -rl -- "$pattern" "${TARGETS[@]}" 2>/dev/null | head -5
    fail=1
  fi
done

# Anything that looks like a long literal bound to a key-like name is treated as a
# leak, because that is how a secret ends up in a bundle in practice.
if grep -rqiE '(api[_-]?key|secret|token|password)"?\s*[:=]\s*"[A-Za-z0-9_-]{20,}' "${TARGETS[@]}" 2>/dev/null; then
  echo "A long literal is assigned to a key-like name in the client bundle:"
  grep -rliE '(api[_-]?key|secret|token|password)"?\s*[:=]\s*"[A-Za-z0-9_-]{20,}' "${TARGETS[@]}" 2>/dev/null | head -5
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "Bundle scan clean: no secrets in the shipped output."
fi
exit "$fail"
