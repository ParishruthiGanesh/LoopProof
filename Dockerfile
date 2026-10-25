# LoopProof — container image for a shareable deployment.
#
# Deliberately NOT a slim production image: the full dependency tree is kept so
# that the optional embedded development chain (Hardhat) can run in the same
# container. See docs/DEPLOY.md for the trade-offs.

FROM node:22-bookworm-slim

# better-sqlite3 falls back to compiling from source when no prebuilt binary
# matches; these are what it needs if that happens.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so a code change does not re-install everything.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Compile the contract and generate the ABI the app imports.
RUN npx hardhat compile && npx tsx scripts/sync-abi.ts

RUN npm run build

# The database and uploaded photographs live here. Mount a volume at /data to
# keep them across restarts; without one they are rebuilt from the seed on
# every boot, which is fine for a demonstration.
RUN mkdir -p /data
ENV LOOPPROOF_DATABASE_PATH=/data/loopproof.db \
    LOOPPROOF_UPLOAD_DIR=/data/uploads \
    NODE_ENV=production \
    PORT=3000

EXPOSE 3000

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

CMD ["/usr/local/bin/entrypoint.sh"]
