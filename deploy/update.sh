#!/usr/bin/env bash
# Greeneration portal — hourly rebuild (run by greeneration-portal-update.service as user `portal`).
# git pull → read-only data sync → build → atomic switch of /var/www/greeneration-portal/current.
# If the sync or the build fails, the current site stays as it is.
set -euo pipefail

APP_DIR=/opt/greeneration-portal
ENV_FILE=/etc/greeneration-portal/env
WEB_DIR=/var/www/greeneration-portal
KEEP=5

cd "$APP_DIR"
echo "update: pulling"
git fetch -q origin main
git merge --ff-only -q origin/main

echo "update: data sync (read-only)"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
if ! "$APP_DIR/.venv/bin/python" scripts/sync_sheets.py; then
  echo "update: sync FAILED — keeping the current site" >&2
  exit 1
fi
# The webhook is only for the sync; keep it out of the build environment.
unset BITRIX_WEBHOOK

echo "update: build"
npm ci --no-audit --no-fund --silent
VITE_SERVER_AUTH=1 npm run build --silent

REL="$WEB_DIR/releases/$(date -u +%Y%m%d-%H%M%S)"
cp -a dist "$REL"
ln -sfn "releases/$(basename "$REL")" "$WEB_DIR/current.new"
mv -Tf "$WEB_DIR/current.new" "$WEB_DIR/current"
echo "update: live → $(basename "$REL")"

# Keep the last $KEEP releases for rollback.
ls -1dt "$WEB_DIR"/releases/* | tail -n +$((KEEP + 1)) | xargs -r rm -rf
