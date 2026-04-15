#!/bin/bash
# SampleTown setup for a fresh Linux server (Ubuntu/Debian).
# Installs Node + pm2, clones the repo, builds, and starts the app under pm2.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<owner>/SampleTown/main/setup.sh | bash
#   # or locally:
#   ./setup.sh
#
# Override defaults via env vars:
#   APP_DIR       install path                      (default: /opt/sampletown)
#   PORT          port pm2 will bind                (default: 3000)
#   NODE_VERSION  major Node version to install     (default: 20)
#   REPO_URL      git repo to clone                 (default: https://github.com/sampletown-org/edna-sampletown.git)
#   BRANCH        branch to check out               (default: main)

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sampletown}"
PORT="${PORT:-3000}"
NODE_VERSION="${NODE_VERSION:-20}"
REPO_URL="${REPO_URL:-https://github.com/sampletown-org/edna-sampletown.git}"
BRANCH="${BRANCH:-main}"

echo "=== SampleTown Setup ==="
echo "    app dir: $APP_DIR"
echo "    port:    $PORT"
echo "    repo:    $REPO_URL ($BRANCH)"
echo

# Node.js via NodeSource. Also installs a C toolchain + python3 so that
# native modules (better-sqlite3) can compile if npm doesn't find a
# prebuilt binary for the host's Node/arch combination.
if ! command -v node &>/dev/null; then
    echo ">> Installing Node.js ${NODE_VERSION} + build tools..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | sudo -E bash -
    sudo apt-get install -y nodejs build-essential python3
fi
echo "Node: $(node --version)"

# pm2
if ! command -v pm2 &>/dev/null; then
    echo ">> Installing pm2..."
    sudo npm install -g pm2
fi

# App directory
sudo mkdir -p "$APP_DIR/data"
sudo chown -R "$(whoami):$(whoami)" "$APP_DIR"

# Clone or pull
if [ -d "$APP_DIR/.git" ]; then
    echo ">> Pulling latest..."
    cd "$APP_DIR"
    git pull --ff-only origin "$BRANCH"
else
    echo ">> Cloning $REPO_URL..."
    git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# Dependencies + build
echo ">> Installing dependencies..."
npm ci --production=false
echo ">> Building..."
npm run build

# .env (create template if missing)
if [ ! -f "$APP_DIR/.env" ]; then
    echo ">> Creating .env template — edit $APP_DIR/.env before going to production"
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
fi

# pm2
echo ">> Starting under pm2 on port $PORT..."
cd "$APP_DIR"
pm2 delete sampletown 2>/dev/null || true
env $(grep -v '^#' .env | grep -v '^$' | xargs) PORT="$PORT" HOST=0.0.0.0 \
    pm2 start build/index.js --name sampletown
pm2 save

echo
echo ">> To enable auto-start on reboot, run the command pm2 prints below:"
pm2 startup | tail -1
echo

echo "=== Done! ==="
echo "App running on port $PORT"
echo "Logs:   pm2 logs sampletown"
echo "Status: pm2 status"
echo
echo "Next: configure nginx to proxy your hostname to 127.0.0.1:$PORT"
echo "      (see docs/DEPLOYMENT.md for an example server block)"
