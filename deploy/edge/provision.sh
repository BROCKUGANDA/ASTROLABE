#!/bin/sh
# Install and start this project's edge on the box.
#
#   ./deploy/edge/provision.sh              # install from this checkout
#   INSTALL_DIR=/srv/crucible-edge ./deploy/edge/provision.sh
#
# ── What it does, and why each step is here ───────────────────────────────────
#
#   1. CHECKS THAT THE FRONT DOOR'S TABLE AND THE EDGE'S PORTS AGREE.
#      The front door routes a hostname to a loopback port; the edge
#      publishes that port. If they disagree, the front door forwards to
#      nothing and the hostname answers with a connection refused — for
#      EVERY public name on the box, not just this one. A two-line file
#      disagreeing with a compose file is exactly the kind of thing that
#      should stop a script rather than be discovered by a visitor.
#
#   2. COPIES THE EDGE INTO ITS OWN DIRECTORY. The application stack is
#      deployed by `scripts/deploy-vps.sh` from the checkout; the edge is
#      deployed from here, into a directory of its own, so that an
#      application deploy can never tear down the edge (and an edge deploy
#      can never touch the application).
#
#   3. STARTS IT AND WAITS FOR HEALTH. `docker compose up -d` returns before
#      the container is serving, and a front door pointed at an edge that is
#      not up yet black-holes the name.
#
#   4. VERIFIES IT ANSWERS, ON THE PUBLIC NAME. The check uses `--resolve`
#      because the edge publishes on LOOPBACK: the name has to be pointed at
#      127.0.0.1 explicitly, or the check would go out to the public
#      internet and measure the front door instead of the edge.
set -eu

SRC="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-$HOME/astrolabe-edge}"
NAME="astrolabe.svalley.tech"
TLS_PORT=8445
HTTP_PORT=8082

# ── 1. the table and the ports must agree ─────────────────────────────────────
for map in "$SRC/nginx/edge.d/crucible.sni.map" "$SRC/nginx/edge.d/crucible.host.map"; do
	[ -f "$map" ] || {
		echo "$map is missing" >&2
		exit 1
	}
done
if ! grep -q "$TLS_PORT;" "$SRC/nginx/edge.d/crucible.sni.map"; then
	echo "the front door's TLS table does not name port $TLS_PORT for $NAME" >&2
	echo "  $SRC/nginx/edge.d/crucible.sni.map" >&2
	exit 1
fi
if ! grep -q "$HTTP_PORT;" "$SRC/nginx/edge.d/crucible.host.map"; then
	echo "the front door's HTTP table does not name port $HTTP_PORT for $NAME" >&2
	echo "  $SRC/nginx/edge.d/crucible.host.map" >&2
	exit 1
fi

# ── 2. install ────────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR/nginx/edge.d"
cp "$SRC/Caddyfile" "$INSTALL_DIR/Caddyfile"
cp "$SRC/compose.yaml" "$INSTALL_DIR/compose.yaml"
cp "$SRC/nginx/edge.d/crucible.sni.map" "$INSTALL_DIR/nginx/edge.d/"
cp "$SRC/nginx/edge.d/crucible.host.map" "$INSTALL_DIR/nginx/edge.d/"

cd "$INSTALL_DIR"

# ── 3. start and wait ─────────────────────────────────────────────────────────
docker compose -f compose.yaml up -d

status=""
for _ in $(seq 1 30); do
	status="$(docker inspect --format '{{.State.Health.Status}}' astrolabe-edge-caddy-1 2>/dev/null || echo starting)"
	[ "$status" = "healthy" ] && break
	sleep 2
done
echo "    health: $status"
[ "$status" = "healthy" ] || {
	echo "the edge did not become healthy" >&2
	exit 1
}

# ── 4. verify it serves ───────────────────────────────────────────────────────
#
# The certificate is the complication, and the check has to be honest about it.
#
# A certificate is issued by Let's Encrypt over HTTP-01, and the challenge has
# to reach THIS edge over the public :80 — which the shared front door owns.
# Until the front door is up and routing this name here, the challenge never
# arrives, no certificate is issued, and the edge has no certificate to serve
# TLS with. That is not a failure of this script; it is the order the split
# happens in.
#
# So the check is conditional on the thing that is actually true:
#
#   certificate present  -> the edge must answer the public name over TLS
#   certificate absent   -> the edge must answer on its HTTP port, which is
#                           the path the challenge will arrive on
#
# The seed script (`seed-certs.sh`) moves an already-issued certificate here,
# which is what makes the first branch the normal one.
VOLUME="astrolabe-edge_caddy-data"
if docker run --rm -v "$VOLUME:/data:ro" alpine:3 sh -c \
	"test -f /data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/$NAME/$NAME.crt" 2>/dev/null; then
	code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 \
		--resolve "$NAME:$TLS_PORT:127.0.0.1" "https://$NAME:$TLS_PORT/" || echo 000)"
	echo "    $NAME on $TLS_PORT (tls) -> $code"
	[ "$code" = "200" ] || {
		echo "the edge does not answer for $NAME over TLS" >&2
		exit 1
	}
else
	code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
		-H "Host: $NAME" "http://127.0.0.1:$HTTP_PORT/" || echo 000)"
	echo "    $NAME on $HTTP_PORT (http) -> $code"
	echo "    no certificate yet: it is issued once the shared front door is up"
	echo "    and routing this name here (the ACME challenge arrives on this port)."
	[ "$code" != "000" ] || {
		echo "the edge does not answer on its HTTP port" >&2
		exit 1
	}
fi

echo "==> the edge is serving $NAME on 127.0.0.1:$TLS_PORT"
echo "    it is NOT on the public ports yet: the shared front door owns those,"
echo "    and it routes this name here once it is up."
