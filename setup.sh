#!/bin/bash
# SampleTown setup script for fresh Ubuntu server
# Usage: ssh arbutus 'bash -s' < setup.sh
#    or: ssh arbutus && bash /opt/sampletown/setup.sh
set -euo pipefail

APP_DIR="/opt/sampletown"
PORT=3001
NODE_VERSION="18"

echo "=== SampleTown Setup ==="

# Node.js via NodeSource
if ! command -v node &>/dev/null; then
    echo ">> Installing Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
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
    git pull --ff-only
else
    echo ">> Cloning repo..."
    git clone https://github.com/Cryomics-Lab/SampleTown.git "$APP_DIR"
    cd "$APP_DIR"
fi

# Dependencies + build
echo ">> Installing dependencies..."
npm ci --production=false
echo ">> Building..."
npm run build

# .env (create template if missing)
if [ ! -f "$APP_DIR/.env" ]; then
    cat > "$APP_DIR/.env" << 'ENVEOF'
AUTH_MODE=hybrid
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REPO=Cryomics-Lab/SampleTown
GITHUB_TOKEN=
DB_PATH=data/sampletown.db
ORIGIN=https://microbial.opencommunity.science
ENVEOF
    echo ">> Created .env template — edit $APP_DIR/.env with your credentials"
fi

# pm2
echo ">> Starting with pm2..."
cd "$APP_DIR"
pm2 delete sampletown 2>/dev/null || true
env $(cat .env | grep -v '^#' | grep -v '^$' | xargs) PORT=$PORT HOST=0.0.0.0 \
    pm2 start build/index.js --name sampletown
pm2 save

# pm2 startup (needs sudo)
echo ""
echo ">> To enable auto-start on reboot, run:"
pm2 startup | tail -1
echo ""

# nginx config
NGINX_CONF="/etc/nginx/sites-available/sampletown"
if [ ! -f "$NGINX_CONF" ]; then
    echo ">> Writing nginx config..."
    sudo tee "$NGINX_CONF" > /dev/null << NGINXEOF
# SampleTown — proxied under /sampletown/ on existing domain
# Add this as an include or location block in your main site config
#
# Standalone subdomain approach (if DNS is set up):
# server {
#     server_name sampletown.opencommunity.science;
#     location / {
#         proxy_pass http://127.0.0.1:${PORT};
#         proxy_http_version 1.1;
#         proxy_set_header Upgrade \$http_upgrade;
#         proxy_set_header Connection 'upgrade';
#         proxy_set_header Host \$host;
#         proxy_set_header X-Real-IP \$remote_addr;
#         proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
#         proxy_set_header X-Forwarded-Proto \$scheme;
#     }
# }
#
# For now, use the session-proxy pattern already set up:
# Access at https://microbial.opencommunity.science/session-proxy/${PORT}/
NGINXEOF
    echo ">> SampleTown will be accessible via the session-proxy pattern at:"
    echo "   https://microbial.opencommunity.science/session-proxy/${PORT}/"
fi

echo ""
echo "=== Done! ==="
echo "SampleTown running on port $PORT"
echo "Access: https://microbial.opencommunity.science/session-proxy/${PORT}/"
echo "Logs:   pm2 logs sampletown"
echo "Status: pm2 status"
