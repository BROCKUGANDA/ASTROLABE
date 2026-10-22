#!/bin/sh
# Move this project's certificate out of the shared edge and into this edge.
#
#   ./deploy/edge/seed-certs.sh
#
# ── Why this exists ───────────────────────────────────────────────────────────
#
# The certificate for this hostname was issued by the SHARED edge, because the
# shared edge was the one serving it. This edge is the one serving it now, so
# the certificate has to MOVE with it — and it has to move with the ACME
# ACCOUNT as well, because an account is what signs the renewal orders. An
# edge with a certificate but no account renews nothing; an edge with an
# account but no certificate issues a new one, and issuing a new one for a
# name that already has a valid certificate is a wasted rate-limit slot.
#
# Moving the certificate is strictly better than re-issuing it:
#
#   · the certificate that is already in a browser's cache keeps working, and
#     a re-issue means a window where some clients see the old certificate
#     and some see the new one;
#   · it costs no Let's Encrypt rate limit;
#   · the ACME account registration is preserved, so the account count does
#     not grow.
#
# ── The account is keyed by the EMAIL, and that is the whole subtlety ───────
#
# Caddy stores an ACME account at
#
#     /data/caddy/acme/<ca>/users/<email>/<localpart>.json
#
# and looks it up BY THAT EMAIL — the one in the `email` global option. So a
# copied account is only found by the edge that is configured with the SAME
# address. An edge configured with a different address does not find the
# account, does not reuse the certificate's registration, and tries to
# REGISTER A NEW ACCOUNT — which fails for a placeholder address
# ("contact email has forbidden domain example.com") and burns a rate-limit
# slot when it does not.
#
# So this script reads the email the shared edge was using and records it in
# the new edge's `.env`. That is the one piece of state that has to travel
# with the account, and it travels with the account.
#
# ── What it copies ───────────────────────────────────────────────────────────
#
#   the ACME account   /data/caddy/acme/<ca>/users/<account>/
#   each certificate   /data/caddy/certificates/<ca>/<hostname>/
#
# Only THIS project's names are copied. The shared edge's other names belong
# to other products and are moved by their own scripts, and a certificate
# store holding somebody else's names is a certificate store that will try to
# renew them.
set -eu

SHARED_EDGE="${SHARED_EDGE:-securevoice-ai-caddy-1}"
TARGET_VOLUME="${TARGET_VOLUME:-astrolabe-edge_caddy-data}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/astrolabe-edge}"
NAMES="astrolabe.svalley.tech"
CA="acme-v02.api.letsencrypt.org-directory"

# `docker info` rather than a test for the socket path: the socket is a
# SOCKET, not a directory, so a `-d` test on it fails on a perfectly healthy
# host — and the failure looks like "docker is not installed".
docker info >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }
docker inspect "$SHARED_EDGE" >/dev/null 2>&1 || {
	echo "the shared edge ($SHARED_EDGE) is not running — the certificates have probably already moved" >&2
	exit 1
}
docker volume inspect "$TARGET_VOLUME" >/dev/null 2>&1 || {
	echo "the target volume ($TARGET_VOLUME) does not exist — start the edge once first" >&2
	exit 1
}

# ── the email the account is registered to ───────────────────────────────────
ACME_MAIL="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$SHARED_EDGE" |
	sed -n 's/^ACME_EMAIL=//p' | head -1)"
[ -n "$ACME_MAIL" ] || {
	echo "the shared edge has no ACME_EMAIL, so the account it holds cannot be identified" >&2
	exit 1
}
echo "==> the ACME account is registered to $ACME_MAIL"

# The edge's own `.env` is where the compose file reads it from. It is written
# only when the operator has not already put one there — an operator's own
# choice of contact address is their choice, and this script says so rather
# than overwriting it.
ENV_FILE="$INSTALL_DIR/.env"
if [ -f "$ENV_FILE" ] && grep -q '^ACME_EMAIL=' "$ENV_FILE"; then
	echo "    $ENV_FILE already names an ACME contact; leaving it alone"
	grep '^ACME_EMAIL=' "$ENV_FILE"
elif grep -q "$ACME_MAIL" "$ENV_FILE" 2>/dev/null; then
	:
else
	echo "ACME_EMAIL=$ACME_MAIL" >"$ENV_FILE"
	echo "    wrote ACME_EMAIL=$ACME_MAIL to $ENV_FILE"
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
# The `caddy` level is part of the path Caddy reads. Staging without it puts
# the store at /data/acme and /data/certificates, where Caddy does not look —
# and a copy that lands in the wrong place is a copy that looks successful.
mkdir -p "$STAGE/caddy"

echo "==> copying the ACME account out of the shared edge"
# `docker cp` requires the DESTINATION's parent to exist; it creates the leaf
# but not the tree.
mkdir -p "$STAGE/caddy/acme"
docker cp "$SHARED_EDGE:/data/caddy/acme/$CA" "$STAGE/caddy/acme/$CA"

echo "==> copying this project's certificates out of the shared edge"
for name in $NAMES; do
	if docker exec "$SHARED_EDGE" sh -c "test -d /data/caddy/certificates/$CA/$name"; then
		mkdir -p "$STAGE/caddy/certificates/$CA"
		docker cp "$SHARED_EDGE:/data/caddy/certificates/$CA/$name" "$STAGE/caddy/certificates/$CA/$name"
		echo "    $name"
	else
		echo "    $name — not in the shared edge (it will be issued fresh)" >&2
	fi
done

echo "==> installing into $TARGET_VOLUME"
# The volume is owned by uid 1000 (the edge runs non-root). Copying as root
# and then chowning is what keeps the edge able to READ the store; a root
# owned store in a 0700 directory is a store the edge cannot open.
docker run --rm \
	-v "$TARGET_VOLUME:/dst" \
	-v "$STAGE:/src:ro" \
	alpine:3 sh -c 'cp -a /src/. /dst/ && chown -R 1000:1000 /dst'

echo "==> the certificate store now holds:"
docker run --rm -v "$TARGET_VOLUME:/data:ro" alpine:3 sh -c \
	'ls /data/caddy/certificates/*/ 2>/dev/null; ls /data/caddy/acme/*/users/ 2>/dev/null' || true
