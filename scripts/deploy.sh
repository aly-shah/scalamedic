#!/usr/bin/env bash
# ScalaMedic Demo deploy — runs on the crm box (the demo lives at
# /var/www/medicore-demo, port 3004, DB medicore_demo). Forked from
# the production deploy.sh; differences are at the top: APP_DIR,
# PM2_PROC, HEALTH_URL all point at the demo. WhatsApp sidecar
# block removed — that's prod-only.
#
# Ordering: regenerate Prisma client → apply pending migrations →
# build → pm2 restart → health check.
#
# `set -euo pipefail` at the top means any step failing aborts the
# deploy before pm2 touches anything (npm run build's exit code
# would otherwise be swallowed by `| tail`).
#
# Usage (from local machine after pushing to GitHub):
#   ssh root@crm.drnakhodas.com 'cd /var/www/medicore-demo && git pull && bash scripts/deploy.sh'

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/medicore-demo}"
PM2_PROC="${PM2_PROC:-medicore-demo}"
HEALTH_URL="${HEALTH_URL:-https://demo.scalamedic.com/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-10}"

log()  { printf '\033[36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$APP_DIR"

log "Prisma client"
npx prisma generate >/dev/null
ok "Prisma client regenerated"

log "Database migrations"
npx prisma migrate deploy | tail -15
ok "Migrations applied"

log "Next.js production build"
# NB: no pipe — we want npm's real exit code, not tail's. If the build
# fails, set -e aborts the script before pm2 sees anything.
npm run build
ok "Build succeeded"

log "pm2 restart $PM2_PROC"
pm2 restart "$PM2_PROC" --update-env | tail -3
ok "pm2 restart issued"

# WhatsApp sidecar block intentionally removed for the demo —
# the prod codebase has it because nakhoda runs a real Baileys
# session on port 3003 (pm2 name "medicore-whatsapp"). The demo
# is sales-only, no patient messaging, and we must NOT restart
# prod's sidecar from here. If the demo ever needs WhatsApp,
# add a separate pm2 entry like "medicore-whatsapp-demo".

log "Health check ($HEALTH_URL)"
for i in $(seq 1 "$HEALTH_RETRIES"); do
  sleep 2
  body=$(curl -fsS "$HEALTH_URL" 2>/dev/null) && {
    ok "Health: $body"
    break
  }
  [ "$i" = "$HEALTH_RETRIES" ] && fail "Health check never returned healthy after ${HEALTH_RETRIES} tries"
done

# This is the demo's deploy script. It does NOT touch prod
# (/var/www/medicore, pm2 medicore, port 3002). If you ever want a
# one-way "snapshot demo from prod" again, add a guarded pg_dump |
# pg_restore here — but be deliberate about it; the whole point of
# this fork is that demo and prod can diverge freely.

ok "Deploy complete"
