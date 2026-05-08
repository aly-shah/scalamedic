#!/usr/bin/env bash
# MediCore deploy — run on the production host (/var/www/medicore).
#
# Ordering: regenerate Prisma client → apply any pending migrations →
# production build → pm2 restart → health check.
#
# Why a script: piping `npm run build` through tail in an ad-hoc SSH
# one-liner swallows the build's non-zero exit code (pipefail off by
# default), which has twice let pm2 restart onto a stale/broken .next
# and produce HTTP 502s. `set -euo pipefail` at the top makes any step
# failing abort the deploy before pm2 touches anything.
#
# Usage (from local machine after rsync'ing the repo):
#   ssh root@medical.scalamatic.com 'bash /var/www/medicore/scripts/deploy.sh'

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/medicore}"
PM2_PROC="${PM2_PROC:-medicore}"
HEALTH_URL="${HEALTH_URL:-https://crm.drnakhodas.com/api/health}"
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

# WhatsApp sidecar — install deps + build + restart pm2 entry. The
# sidecar lives in $APP_DIR/whatsapp-server with its own package.json.
# Skip silently if the directory hasn't landed on the box yet (first
# deploy after adding the feature won't have it pre-provisioned).
if [ -d "$APP_DIR/whatsapp-server" ]; then
  log "WhatsApp sidecar"
  pushd "$APP_DIR/whatsapp-server" >/dev/null
  if [ -f package.json ]; then
    # Sidecar needs tsc, so include dev deps. The sidecar's deps are
    # minimal (4 packages) so size isn't a concern.
    if [ ! -d node_modules ] || [ package.json -nt node_modules/.package-lock.json ]; then
      npm install --no-audit --no-fund 2>&1 | tail -10 || true
    fi
    npx tsc 2>&1 | tail -10 || true
  fi
  popd >/dev/null

  # Source env from main app's .env so WHATSAPP_SERVICE_TOKEN +
  # WA_AUTH_DIR are visible to pm2 when it spawns/refreshes the
  # sidecar. The sidecar is a plain Node process and won't read .env
  # on its own.
  if [ -f "$APP_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$APP_DIR/.env"
    set +a
  fi

  if pm2 describe medicore-whatsapp >/dev/null 2>&1; then
    pm2 restart medicore-whatsapp --update-env | tail -3
  else
    pm2 start "$APP_DIR/whatsapp-server/dist/index.js" \
      --name medicore-whatsapp \
      --update-env \
      --time 2>&1 | tail -3 || true
    pm2 save >/dev/null 2>&1 || true
  fi
  ok "WhatsApp sidecar refreshed"
fi

log "Health check ($HEALTH_URL)"
for i in $(seq 1 "$HEALTH_RETRIES"); do
  sleep 2
  body=$(curl -fsS "$HEALTH_URL" 2>/dev/null) && {
    ok "Health: $body"
    break
  }
  [ "$i" = "$HEALTH_RETRIES" ] && fail "Health check never returned healthy after ${HEALTH_RETRIES} tries"
done

# Mirror call removed 2026-05-06 — crm.drnakhodas.com is now the
# source of truth (deploys land there directly, no more drop-and-
# reload from medical). medical.scalamatic.com is kept alive as a
# static snapshot only; running deploy.sh on medical no longer
# touches crm. To re-enable a one-way mirror, restore
# scripts/mirror-to-crm.sh and add a guarded call here.

ok "Deploy complete"
