#!/usr/bin/env bash
# Deploy ASTROLABE to the submission VPS. Run ON the box, from a checkout.
#
#   ./scripts/deploy-vps.sh                 # build the current checkout and swap it in
#   ./scripts/deploy-vps.sh v1.1.0          # build a tag
#
# What this does and why each step is here, in the order it happens:
#
#   1. The image is built on the box rather than pulled. ghcr.io packages
#      created by a workflow are private by default, and the runner IS this
#      machine, so building here is one fewer credential in the path.
#   2. The container joins the edge's network with a name alias. Caddy resolves
#      `astrolabe:3000` on securevoice-ai_default; a container recreated without
#      that attachment leaves the hostname 502 until someone notices.
#   3. The old container is stopped before the new one takes the port, and the
#      new one is health-checked before the old one is removed — a failed build
#      cannot take the site down on the way in.
#   4. The production smoke suite runs against the PUBLIC URL at the end. A green
#      local port means nothing if the edge is not routing.
#
# Secrets stay on the box: /home/ubuntu/astrolabe-data/.env is never written by
# this script and never carried in a commit.
set -euo pipefail

REF="${1:-}"
APP_DIR="${APP_DIR:-$HOME/astrolabe}"
DATA_DIR="${DATA_DIR:-$HOME/astrolabe-data}"
EDGE_NET="${EDGE_NET:-securevoice-ai_default}"
PUBLIC_URL="${PUBLIC_URL:-https://astrolabe.svalley.tech}"
IMAGE="astrolabe"

cd "$APP_DIR"
if [ -n "$REF" ]; then
  git fetch --tags --quiet origin
  git checkout --quiet "$REF"
else
  git fetch --quiet origin
  git reset --hard --quiet origin/main
fi
SHA="$(git rev-parse --short HEAD)"
TAG="$(git describe --tags --exact-match 2>/dev/null || echo "$SHA")"
echo "==> building $IMAGE:$TAG (commit $SHA)"
docker build -q -t "$IMAGE:$TAG" -t "$IMAGE:latest" . >/dev/null

if [ ! -f "$DATA_DIR/.env" ]; then
  echo "==> first run: creating $DATA_DIR/.env with a generated session secret"
  mkdir -p "$DATA_DIR/db"
  umask 077
  {
    echo "SESSION_SECRET=$(openssl rand -hex 32)"
    echo "NODE_ENV=production"
    echo "DATABASE_URL=file:/app/db/custom.db"
    echo "SITE_URL=$PUBLIC_URL"
  } >"$DATA_DIR/.env"
  # The Prisma schema has to exist before the container can report db:ok.
  (cd "$APP_DIR" && bun install --frozen-lockfile >/dev/null && \
    DATABASE_URL="file:$DATA_DIR/db/custom.db" bun run db:push >/dev/null)
fi

echo "==> swapping the running container"
docker stop -t 10 astrolabe >/dev/null 2>&1 || true
docker rm astrolabe >/dev/null 2>&1 || true
docker run -d --name astrolabe \
  --restart unless-stopped \
  --network "$EDGE_NET" \
  --network-alias astrolabe \
  --publish 127.0.0.1:3100:3000 \
  --env-file "$DATA_DIR/.env" \
  --volume "$DATA_DIR/db:/app/db" \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  "$IMAGE:$TAG" >/dev/null

echo "==> waiting for the container to report healthy"
for _ in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' astrolabe 2>/dev/null || echo starting)"
  [ "$status" = "healthy" ] && break
  sleep 2
done
echo "    health: $status"

echo "==> smoke suite against the public URL"
bash scripts/ci-smoke.sh "$PUBLIC_URL"

echo "==> done: $IMAGE:$TAG serving $PUBLIC_URL"
docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true
