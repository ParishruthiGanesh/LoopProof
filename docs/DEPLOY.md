# Sharing LoopProof with other people

Four ways, from least to most effort. Pick by how long the link needs to live.

| Option | Link lives | Blockchain anchors | Effort |
|---|---|---|---|
| **1. Tunnel from your laptop** | while your laptop is on | yes, fully | 1 minute |
| **2. Render / Fly, chain off** | permanently | no — stated honestly in the app | ~10 minutes |
| **3. Render / Fly, chain embedded** | permanently | yes, on an in-container dev chain | ~10 minutes, needs 1 GB |
| **4. Any Docker host** | permanently | your choice | you already know how |

> **Before any of these:** a deployed LoopProof is a *demonstration*. The sign-in page
> offers one-click entry to all three fictional organizations, so anyone with the link can
> act as any of them. That is intended for a hackathon demo and wrong for anything else.

---

## Option 1 — Tunnel from your laptop (best for a live demo)

Run everything locally exactly as you already do, then expose port 3000:

```bash
# terminal 1-3: the usual local setup
npm run chain:node
npm run chain:deploy && npm run chain:anchor
npm run dev

# terminal 4: publish it
npx cloudflared tunnel --url http://localhost:3000
```

Cloudflare prints a `https://something-random.trycloudflare.com` URL. Anyone can open it.

**Why this is the best option for judging:** it is the only one where the full stack —
including the local blockchain and its confirmed anchors — is exactly what you tested.
Nothing is degraded.

**Caveats:** the link dies when you close the terminal or your laptop sleeps, and QR codes
will still encode `http://localhost:3000` unless you restart the dev server with the
tunnel URL:

```bash
LOOPPROOF_PUBLIC_BASE_URL=https://something-random.trycloudflare.com npm run dev
```

`npx localtunnel --port 3000` and `ngrok http 3000` do the same job.

---

## Option 2 — Render, chain off (best for a permanent link)

1. Push this branch to GitHub (already done).
2. In Render: **New → Blueprint**, point it at the repository and this branch. It reads
   `render.yaml`.
3. Optionally add `ANTHROPIC_API_KEY` under the service's **Environment** tab to switch on
   live photograph analysis.
4. Deploy. First build takes a few minutes; it compiles the contract and builds the app.

What you get: the whole product — marketplace, listing creation, matching, the two-party
transfer workflow, passports, impact — on a URL you can share. The banner will read
**"Chain: no contract configured"**, and anchor statuses will read **"Not anchored"**.
That is the app being truthful, not broken: nothing claims a confirmation it does not have.

`render.yaml` requests a 1 GB disk mounted at `/data` so the database and uploaded
photographs survive restarts. Remove the `disk:` block if you would rather the demo reset
itself from the seed on every deploy.

### Fly.io instead

```bash
fly launch --no-deploy       # answer no to generating a new config; fly.toml is here
fly volumes create loopproof_data --size 1
fly secrets set LOOPPROOF_SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
fly secrets set ANTHROPIC_API_KEY=sk-ant-...   # optional
fly deploy
```

Change `app = "loopproof-demo"` in `fly.toml` to a name nobody has taken.

---

## Option 3 — Permanent link *with* working anchors

Set `LOOPPROOF_EMBED_CHAIN=true`. The container then starts a Hardhat node on its own
loopback interface, deploys the registry, anchors the seeded listings, and only then
serves the app. Passports show **Confirmed on local dev chain** and the tamper check has a
real anchor to fail against.

```bash
# Render: raise the plan to standard (2 GB) and set the variable
# Fly:
fly scale memory 1024
fly secrets set LOOPPROOF_EMBED_CHAIN=true
fly deploy
```

**Why it is off by default:** a Hardhat node needs roughly 300–400 MB on its own. On a
512 MB instance it will not fit beside Next.js, and the container will be killed mid-boot.
Give it 1 GB.

**What it does and does not mean.** This is still a *local development chain*, now living
inside your container rather than on your laptop. Its wallets are controlled by the
deployment. It demonstrates the mechanism honestly and the app labels it as exactly that.
It is not a public network, and no real funds are involved.

**It is also ephemeral.** The chain restarts empty whenever the container does, while the
database on the volume persists. LoopProof handles this: on boot it detects that its
recorded confirmations do not apply to the chain now running, marks them stale and
re-anchors. If you browse a passport in the gap between a restart and the re-anchor, it
says *"LoopProof's record and the chain disagree"* rather than showing a confirmation it
cannot stand behind.

---

## Option 4 — Any Docker host

```bash
docker build -t loopproof .
docker run -p 3000:3000 \
  -v loopproof-data:/data \
  -e LOOPPROOF_SESSION_SECRET="$(openssl rand -hex 32)" \
  -e LOOPPROOF_PUBLIC_BASE_URL="https://your-domain.example" \
  -e LOOPPROOF_EMBED_CHAIN=true \
  loopproof
```

Works on Railway, Google Cloud Run (with a mounted volume), Hetzner, a VPS, anywhere.

> **Not tested:** the Docker image build itself was never run, because no Docker daemon
> was available in the environment this was built in. The `docker/entrypoint.sh` logic —
> migrations, seeding, embedded chain, deploy, anchoring, serving, and the restart path —
> *was* run and verified directly. If the build fails it will be something small in the
> `Dockerfile`, most likely a native-module compile for `better-sqlite3`.

---

## Environment variables for a deployment

| Variable | Needed? | Notes |
|---|---|---|
| `LOOPPROOF_SESSION_SECRET` | **yes** | Without it the entrypoint generates a random one per boot, so everyone is signed out on every restart. |
| `LOOPPROOF_PUBLIC_BASE_URL` | recommended | What item QR codes encode. Auto-detected on Render and Fly. |
| `LOOPPROOF_DATABASE_PATH` | set by configs | Put it on a mounted volume to keep data. |
| `LOOPPROOF_UPLOAD_DIR` | set by configs | Same volume. |
| `ANTHROPIC_API_KEY` | optional | Switches photograph analysis from example mode to live. |
| `LOOPPROOF_EMBED_CHAIN` | optional | `true` starts the in-container development chain. Needs ~1 GB. |
| `LOOPPROOF_CHAIN_SIMULATION` | leave unset | Only set this if you specifically want the "simulated" label. |

## What will *not* work

- **Vercel, Netlify Functions, or any serverless platform with an ephemeral or read-only
  filesystem.** LoopProof uses SQLite on disk and writes uploaded photographs to disk.
  Both are lost between invocations there. Moving to a hosted database means swapping the
  Drizzle driver (for example to libSQL/Turso) and moving uploads to object storage —
  a real change, not a configuration flag.
- **Scaling to more than one instance.** SQLite on a single volume means one writer. The
  reservation guarantees depend on that.
