#!/bin/bash
# Quick deploy to Arbutus — pull, build, restart
# Usage: ./deploy.sh
set -euo pipefail

REMOTE="arbutus"
APP_DIR="/opt/sampletown"

echo "=== Deploying SampleTown to $REMOTE ==="

# Push latest to GitHub first
echo ">> Pushing to GitHub..."
git push origin main

# Pull, build, restart on remote
echo ">> Pulling and building on $REMOTE..."
ssh "$REMOTE" << EOF
set -euo pipefail
cd $APP_DIR
git pull --ff-only
npm ci --production=false
npm run build
env \$(cat .env | grep -v '^#' | grep -v '^\$' | xargs) PORT=3001 HOST=0.0.0.0 pm2 restart sampletown --update-env
echo ">> Restarted. Status:"
pm2 list
EOF

echo ""
echo "=== Deploy complete ==="
echo "https://microbial.opencommunity.science/session-proxy/3001/"
