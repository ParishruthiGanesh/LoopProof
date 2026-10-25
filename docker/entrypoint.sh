#!/usr/bin/env bash
# Boots LoopProof in a container: prepare the database, optionally start an
# embedded development chain, then serve the app.
#
# Everything here is best-effort except the database. If the chain cannot be
# started the app still serves, and says honestly that no contract is
# configured rather than pretending otherwise.
set -euo pipefail

log() { echo "[loopproof] $*"; }

# ---------------------------------------------------------------- base URL
# QR codes encode an absolute URL, so the public origin has to be known.
if [ -z "${LOOPPROOF_PUBLIC_BASE_URL:-}" ]; then
  if [ -n "${RENDER_EXTERNAL_URL:-}" ]; then
    export LOOPPROOF_PUBLIC_BASE_URL="$RENDER_EXTERNAL_URL"
  elif [ -n "${FLY_APP_NAME:-}" ]; then
    export LOOPPROOF_PUBLIC_BASE_URL="https://${FLY_APP_NAME}.fly.dev"
  else
    export LOOPPROOF_PUBLIC_BASE_URL="http://localhost:${PORT:-3000}"
  fi
fi
log "public base URL: $LOOPPROOF_PUBLIC_BASE_URL"

if [ -z "${LOOPPROOF_SESSION_SECRET:-}" ]; then
  log "WARNING: LOOPPROOF_SESSION_SECRET is not set. Sessions will not survive a restart"
  log "         and this must not be used for anything but a demonstration."
  export LOOPPROOF_SESSION_SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
fi

# ---------------------------------------------------------------- database
mkdir -p "$(dirname "${LOOPPROOF_DATABASE_PATH:-/data/loopproof.db}")"
mkdir -p "${LOOPPROOF_UPLOAD_DIR:-/data/uploads}"

log "applying migrations"
npx tsx --conditions=react-server scripts/migrate.ts

log "seeding demonstration data if the database is empty"
npx tsx --conditions=react-server scripts/seed.ts

# ------------------------------------------------------------------- chain
# Off by default: a Hardhat node needs roughly 300-400 MB on its own, which does
# not fit alongside the app on a 512 MB instance. With it off the app reports
# "Chain: no contract configured", which is true.
if [ "${LOOPPROOF_EMBED_CHAIN:-false}" = "true" ]; then
  log "starting the embedded development chain"
  npx hardhat node --hostname 127.0.0.1 --port 8545 > /tmp/chain.log 2>&1 &
  CHAIN_PID=$!

  for i in $(seq 1 30); do
    if node -e "fetch('http://127.0.0.1:8545',{method:'POST',headers:{'content-type':'application/json'},body:'{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_blockNumber\",\"params\":[]}'}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
      log "chain is up after ${i}s"
      break
    fi
    sleep 1
  done

  if kill -0 "$CHAIN_PID" 2>/dev/null; then
    if npx tsx --conditions=react-server scripts/deploy-contract.ts; then
      # deploy-contract.ts writes .env.local; Next reads it at startup.
      set -a
      # shellcheck disable=SC1091
      . ./.env.local
      set +a
      log "anchoring seeded listings"
      npx tsx --conditions=react-server scripts/anchor-seed.ts || log "anchoring incomplete; the app will show the real status"
    else
      log "deployment failed; continuing without a contract"
    fi
  else
    log "the chain did not start; continuing without a contract"
    cat /tmp/chain.log | tail -20 || true
  fi
else
  log "embedded chain disabled (set LOOPPROOF_EMBED_CHAIN=true to enable; needs ~1 GB)"
fi

# --------------------------------------------------------------------- app
log "starting the application on port ${PORT:-3000}"
exec npx next start --port "${PORT:-3000}" --hostname 0.0.0.0
