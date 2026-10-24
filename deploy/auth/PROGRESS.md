# Login page — progress (temporary, delete when done)
## Done
- Code complete in working tree: portal_auth.py + unit, frontend (auth.ts, Login, Shell UserMenu, live.ts, main.tsx, Home), styles, sync users/avatars, deploy configs, install.sh, make-users.sh, README (ru)
- `npm run build` passes (server + demo); auth service tested locally (401/200/cookie flags/429, case-insensitive email)
## Blocked
- Push to main denied by the auto-mode classifier ("Production Deploy") — needs Victoria's explicit OK
## Next (once push allowed)
1. Commit A (server-only): deploy/auth/portal_auth.py, systemd unit, install.sh, make-users.sh, README, caddy/nginx/traefik snippets → push; wait for /opt pull
2. Server: install unit, start, curl 127.0.0.1:8089/auth/healthz
3. Caddy: backup, /auth + /live forward_auth, caddy validate, reload
4. Commit B: src/*, scripts/sync_sheets.py, portal-web default.conf + compose → push; wait for rebuild (users + avatars in live.json)
5. Verify via Playwright (with basic auth creds), then drop auth_basic: cat default.conf into /etc/greeneration-portal/nginx/default.conf, compose up -d, chown root:portal web-auth dir+file
6. Final verify; delete wip/login-page + this file
## Server state (12:00 UTC): unit installed+active, Caddy routes live (backup Caddyfile.bak-20261024-115337), commits 6059657 + 4dac1e1 pushed; waiting for rebuild; basic auth still ON
- bcrypt 5.0.0 in /opt/greeneration-portal/.venv
- PORTAL_SESSION_SECRET added to /etc/greeneration-portal/env (portal:portal 600)
- web-auth dir + htpasswd TRANSITIONAL portal:lxd 750/640 (nginx gid 101=lxd still reads it, portal reads as owner); final target root:portal
- htpasswd: 3 users, bcrypt $2y$, Green2026 verified for all three
- auth unit NOT installed; Caddyfile unchanged; nginx basic auth still ON (site closed)
