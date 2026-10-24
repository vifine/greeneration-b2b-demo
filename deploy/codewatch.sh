#!/usr/bin/env bash
# Greeneration portal — deploy interface changes right away.
# Run every 2 minutes by greeneration-portal-codewatch.timer (as root).
# If main on GitHub has new commits, start the regular rebuild (greeneration-portal-update.service).
# Data from Sheets/Bitrix24 is still refreshed hourly by greeneration-portal-update.timer.
set -euo pipefail
APP_DIR=/opt/greeneration-portal
systemctl is-active --quiet greeneration-portal-update.service && exit 0   # a rebuild is already running
sudo -u portal git -C "$APP_DIR" fetch -q origin main
LOCAL=$(sudo -u portal git -C "$APP_DIR" rev-parse HEAD)
REMOTE=$(sudo -u portal git -C "$APP_DIR" rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] && exit 0
echo "codewatch: new code ${REMOTE:0:7} (was ${LOCAL:0:7}) — rebuilding"
systemctl start --no-block greeneration-portal-update.service
