#!/usr/bin/env bash
# Greeneration portal — one-time server install (idempotent: safe to run again).
# Usage:  sudo bash deploy/install.sh            (from a checkout)
#   or:   curl -fsSL https://raw.githubusercontent.com/vifine/greeneration-b2b-demo/main/deploy/install.sh | sudo bash
#
# What it does:
#   - system user `portal`, code in /opt/greeneration-portal (public repo, HTTPS clone)
#   - Node.js 20 + Python venv with google-auth/requests for the read-only data sync
#   - secrets file /etc/greeneration-portal/env (placeholders only, chmod 600)
#   - web container `portal-web` (nginx, basic auth) on 127.0.0.1:8088 serving /var/www/greeneration-portal/current
#   - systemd timer: rebuild every hour 07:00–23:00 Asia/Dubai
#   - detects the reverse proxy already in front of Supabase/n8n and prints the snippet to add
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/vifine/greeneration-b2b-demo.git}"
APP_DIR=/opt/greeneration-portal
ETC_DIR=/etc/greeneration-portal
WEB_DIR=/var/www/greeneration-portal
PORT="${PORTAL_PORT:-8088}"
DOMAIN="${PORTAL_DOMAIN:-b2b.greeneration.ae}"

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo"; exit 1; }

log "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates python3 python3-venv apache2-utils >/dev/null
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
command -v docker >/dev/null || { warn "Docker not found — install Docker first"; exit 1; }

log "User and folders"
id portal >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/portal --shell /usr/sbin/nologin portal
install -d -o portal -g portal -m 755 "$APP_DIR" "$WEB_DIR" "$WEB_DIR/releases"
install -d -o root -g portal -m 750 "$ETC_DIR"

log "Code"
if [ -d "$APP_DIR/.git" ]; then
  sudo -u portal git -C "$APP_DIR" pull --ff-only -q
else
  sudo -u portal git clone -q "$REPO_URL" "$APP_DIR"
fi

log "Python venv for the sync"
[ -x "$APP_DIR/.venv/bin/python" ] || sudo -u portal python3 -m venv "$APP_DIR/.venv"
sudo -u portal "$APP_DIR/.venv/bin/pip" install -q --upgrade pip google-auth requests

log "Secrets file (placeholders only — fill in by hand)"
if [ ! -f "$ETC_DIR/env" ]; then
  cat > "$ETC_DIR/env" <<'ENV'
# Greeneration portal secrets. Owner portal, chmod 600. Never commit or paste in chat.
# Google service account key (claude-sheets@vifine-personal) — copy the JSON file here:
GOOGLE_APPLICATION_CREDENTIALS=/etc/greeneration-portal/google-sa.json
# Bitrix24 inbound webhook (read-only use), e.g. https://bitrix24.greeneration.ae/rest/<user>/<code>/
BITRIX_WEBHOOK=
ENV
fi
chown portal:portal "$ETC_DIR/env"; chmod 600 "$ETC_DIR/env"
[ -f "$ETC_DIR/google-sa.json" ] && { chown portal:portal "$ETC_DIR/google-sa.json"; chmod 600 "$ETC_DIR/google-sa.json"; } \
  || warn "Copy the Google key to $ETC_DIR/google-sa.json (chmod 600, owner portal)"
[ -f "$ETC_DIR/htpasswd" ] || warn "No users yet: run  sudo bash $APP_DIR/deploy/make-users.sh"

log "Web container portal-web on 127.0.0.1:$PORT"
install -d -m 755 "$ETC_DIR/nginx"
install -m 644 "$APP_DIR/deploy/portal-web/default.conf" "$ETC_DIR/nginx/default.conf"
touch "$ETC_DIR/htpasswd"; chown root:portal "$ETC_DIR/htpasswd"; chmod 640 "$ETC_DIR/htpasswd"
PORTAL_PORT="$PORT" docker compose -f "$APP_DIR/deploy/portal-web/docker-compose.yml" -p greeneration-portal up -d

log "systemd timer (hourly 07:00–23:00 Dubai)"
install -m 644 "$APP_DIR/deploy/systemd/greeneration-portal-update.service" /etc/systemd/system/
install -m 644 "$APP_DIR/deploy/systemd/greeneration-portal-update.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now greeneration-portal-update.timer

log "First build"
systemctl start greeneration-portal-update.service || warn "First build failed — see: journalctl -u greeneration-portal-update -n 100"

log "Reverse proxy in front of the server"
PROXY=none
if systemctl is-active --quiet nginx 2>/dev/null; then PROXY=nginx
elif systemctl is-active --quiet caddy 2>/dev/null; then PROXY=caddy
elif docker ps --format '{{.Image}} {{.Names}}' | grep -qi traefik; then PROXY=traefik
elif docker ps --format '{{.Image}} {{.Names}}' | grep -qi caddy; then PROXY=caddy-docker
elif docker ps --format '{{.Image}} {{.Names}}' | grep -Eqi 'nginx-proxy|nginxproxymanager|jc21'; then PROXY=nginx-proxy-manager
elif docker ps --format '{{.Image}} {{.Names}}' | grep -qi nginx; then PROXY=nginx-docker
fi
echo "Detected: $PROXY"
case "$PROXY" in
  nginx) echo "Next: sudo cp $APP_DIR/deploy/nginx/b2b.greeneration.ae.conf /etc/nginx/sites-available/ && sudo ln -sf /etc/nginx/sites-available/b2b.greeneration.ae.conf /etc/nginx/sites-enabled/ && sudo certbot --nginx -d $DOMAIN && sudo nginx -t && sudo systemctl reload nginx" ;;
  caddy|caddy-docker) echo "Next: add $APP_DIR/deploy/caddy/Caddyfile.snippet to the Caddyfile and reload Caddy (docker: point it at host.docker.internal:$PORT)" ;;
  traefik) echo "Next: copy $APP_DIR/deploy/traefik/b2b.yml into Traefik's dynamic config folder (file provider)" ;;
  nginx-proxy-manager) echo "Next: in Nginx Proxy Manager add Proxy Host $DOMAIN → http://<host-ip>:$PORT, request a Let's Encrypt certificate, force SSL" ;;
  *) echo "Next: see deploy/README.md, section 'Прокси'" ;;
esac
echo "Check locally: curl -I -u <user> http://127.0.0.1:$PORT/"
