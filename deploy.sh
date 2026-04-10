#!/bin/bash
# Quick deploy: push to GitHub, then pull/build/restart on a remote host.
#
# Usage:   ./deploy.sh
# Config:  override defaults via env vars or a local .deploy.env file
#
#   REMOTE      ssh host alias or user@host       (default: sampletown)
#   APP_DIR     install path on the remote        (default: /opt/sampletown)
#   PORT        port pm2 will bind                (default: 3000)
#   BRANCH      branch to push and pull           (default: main)
#
# Example .deploy.env:
#   REMOTE=myvm
#   APP_DIR=/srv/sampletown
#   PORT=3001

set -euo pipefail

# Load local overrides if present (gitignored)
if [ -f ".deploy.env" ]; then
    set -a; . ./.deploy.env; set +a
fi

REMOTE="${REMOTE:-sampletown}"
APP_DIR="${APP_DIR:-/opt/sampletown}"
PORT="${PORT:-3000}"
BRANCH="${BRANCH:-main}"

echo "=== Deploying SampleTown ==="
echo "    remote:  $REMOTE"
echo "    app dir: $APP_DIR"
echo "    port:    $PORT"
echo "    branch:  $BRANCH"
echo

echo ">> Pushing to GitHub..."
git push origin "$BRANCH"

echo ">> Pulling and building on $REMOTE..."
ssh "$REMOTE" APP_DIR="$APP_DIR" PORT="$PORT" BRANCH="$BRANCH" bash <<'EOF'
set -euo pipefail
cd "$APP_DIR"
git pull --ff-only origin "$BRANCH"
npm ci --production=false
npm run build
env $(grep -v '^#' .env | grep -v '^$' | xargs) PORT="$PORT" HOST=0.0.0.0 \
    pm2 restart sampletown --update-env
echo ">> Status:"
pm2 list
EOF

echo
echo "=== Deploy complete ==="
