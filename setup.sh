#!/usr/bin/env bash
# ============================================================
# ServerDash – Ubuntu 24.04 setup script
# Run as root: sudo bash setup.sh
# ============================================================
set -e

INSTALL_DIR="/opt/serverdash"
PORT="${PORT:-10000}"
APP_USER="serverdash"

echo ""
echo "============================================="
echo "  ServerDash Installation"
echo "  Port: $PORT"
echo "  Directory: $INSTALL_DIR"
echo "============================================="
echo ""

# ── 1. System dependencies ────────────────────────────────
echo "[1/7] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq nodejs npm git curl

# Install pm2 globally
npm install -g pm2 --silent

# ── 2. Create service user ────────────────────────────────
echo "[2/7] Creating service user: $APP_USER..."
if ! id "$APP_USER" &>/dev/null; then
  useradd -r -s /usr/sbin/nologin -m -d "$INSTALL_DIR" "$APP_USER"
  echo "  Created user: $APP_USER"
fi

# Docker socket access for serverdash user
if [ -S /var/run/docker.sock ]; then
  usermod -aG docker "$APP_USER" 2>/dev/null || true
  echo "  Added $APP_USER to docker group"
fi

# Sudoers rule — allow serverdash to run privileged commands without a password
SUDOERS_FILE="/etc/sudoers.d/serverdash"
cat > "$SUDOERS_FILE" <<'EOF'
# ServerDash — passwordless sudo for required system commands
serverdash ALL=(ALL) NOPASSWD: \
  /usr/bin/apt-get, \
  /usr/bin/apt, \
  /usr/sbin/useradd, \
  /usr/sbin/userdel, \
  /usr/sbin/usermod, \
  /usr/sbin/chpasswd, \
  /usr/bin/crontab, \
  /usr/sbin/shutdown, \
  /sbin/shutdown, \
  /usr/sbin/ufw, \
  /usr/bin/systemctl, \
  /usr/bin/journalctl, \
  /usr/bin/dmesg, \
  /usr/bin/tail
EOF
chmod 440 "$SUDOERS_FILE"
echo "  Sudoers rule written to $SUDOERS_FILE"

# ── 3. Copy app files ─────────────────────────────────────
echo "[3/7] Copying application files..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$(realpath "$SCRIPT_DIR")" != "$(realpath "$INSTALL_DIR")" ]; then
  cp -r "$SCRIPT_DIR/." "$INSTALL_DIR"
else
  echo "  Already running from $INSTALL_DIR — skipping copy"
fi
chown -R "$APP_USER":"$APP_USER" "$INSTALL_DIR"

# ── 4. Install backend dependencies ───────────────────────
echo "[4/7] Installing backend dependencies..."
cd "$INSTALL_DIR/backend"
npm install --production --silent

# ── 5. Configure environment ──────────────────────────────
echo "[5/7] Configuring environment..."
if [ ! -f "$INSTALL_DIR/backend/.env" ]; then
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  cat > "$INSTALL_DIR/backend/.env" <<EOF
PORT=$PORT
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=8h
APP_NAME=ServerDash
DB_PATH=$INSTALL_DIR/data/serverdash.db
CORS_ORIGIN=*
NODE_ENV=production
EOF
  echo "  Created .env with a random JWT secret"
else
  echo "  .env already exists, skipping..."
fi

# ── 6. Build frontend ─────────────────────────────────────
echo "[6/7] Building frontend..."
cd "$INSTALL_DIR/frontend"
npm install --silent
npm run build

# ── 7. Start with PM2 ────────────────────────────────────
echo "[7/7] Starting ServerDash with PM2..."
cd "$INSTALL_DIR"

# Run pm2 as the serverdash user to avoid running as root
sudo -u "$APP_USER" pm2 delete serverdash 2>/dev/null || true
sudo -u "$APP_USER" pm2 start ecosystem.config.js --env production

sudo -u "$APP_USER" pm2 save
pm2 startup systemd -u "$APP_USER" --hp "$INSTALL_DIR" 2>/dev/null || true
systemctl enable pm2-"$APP_USER" 2>/dev/null || true

echo ""
echo "============================================="
echo "  ✓ ServerDash is running!"
echo ""
echo "  URL:           http://$(hostname -I | awk '{print $1}'):$PORT"
echo "  Default login: admin / Admin1234!"
echo ""
echo "  IMPORTANT: Change the password immediately!"
echo "============================================="
echo ""
