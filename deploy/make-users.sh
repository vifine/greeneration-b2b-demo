#!/usr/bin/env bash
# Create or reset portal logins (bcrypt htpasswd read by the login service). Passwords are typed in, never stored in the repo.
# Usage: sudo bash deploy/make-users.sh                 — all three users
#        sudo bash deploy/make-users.sh levkova@greeneration.ae   — one user (reset password)
set -euo pipefail
AUTH_DIR=/etc/greeneration-portal/web-auth
HTPASSWD=$AUTH_DIR/htpasswd
# Keep in sync with PORTAL_ACCOUNTS in scripts/sync_sheets.py (Bitrix24 profiles for the header).
USERS=("vifine767@gmail.com" "levkova@greeneration.ae" "nikolaychik@greeneration.ae")   # Victoria Fine, Aleksandra Levkova, Ivan Nikolaychik

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo"; exit 1; }
command -v htpasswd >/dev/null || apt-get install -y -qq apache2-utils >/dev/null
install -d -o root -g portal -m 750 "$AUTH_DIR"
touch "$HTPASSWD"

[ $# -gt 0 ] && USERS=("$@")
read -rsp "Password for ${#USERS[@]} user(s) (agreed with Victoria): " PW; echo
read -rsp "Repeat: " PW2; echo
[ "$PW" = "$PW2" ] && [ -n "$PW" ] || { echo "Passwords differ or empty"; exit 1; }
for u in "${USERS[@]}"; do
  htpasswd -iB "$HTPASSWD" "$u" <<<"$PW" >/dev/null
  echo "ok: $u"
done
unset PW PW2
chown root:portal "$HTPASSWD"; chmod 640 "$HTPASSWD"   # the login service re-reads it on change, no restart
echo "Users in $HTPASSWD: $(cut -d: -f1 "$HTPASSWD" | paste -sd, -)"
