# LoopProof

**Give equipment a second life. Keep the proof.**

LoopProof helps universities, businesses and nonprofits find a second use for surplus
equipment and document completed transfers.

A university department has a working monitor it no longer needs. A community classroom
needs one. LoopProof turns photographs into a useful listing, matches it against what the
classroom actually asked for, coordinates the handoff, and leaves behind a QR-linked
passport holding the condition evidence and both organizations' acknowledgments.

Built for the **IEEE ClimateChain Global Hackathon**, Sustainable Supply Chains track.

> LoopProof records acknowledgments and detects changes to anchored evidence. It does not
> independently prove that an item works, that a physical handoff occurred, or that the
> same object was not registered under a different identity.

LoopProof is not the first reuse marketplace and is not a certified carbon-credit
platform. It issues no carbon credits, tokens or environmental certificates.

---

## Quick start

```bash
npm install
npm run setup          # compiles the contract, creates the database, seeds demo data
npm run dev            # http://localhost:3000
```

That gets you the whole product except the blockchain anchors and live photo analysis.
Both are optional and the app states plainly, in a banner on every page, which of them is
switched on right now.

### Add the local blockchain (recommended for the demo)

In three terminals:

```bash
# 1. a local EVM development chain on 127.0.0.1:8545 (chainId 31337)
npm run chain:node

# 2. deploy the registry and write .env.local
npm run chain:deploy

# 3. anchor the seeded listings' evidence, then start the app
npm run chain:anchor
npm run dev
```

`npm run chain:deploy` writes `LOOPPROOF_CONTRACT_ADDRESS` and the three organization
wallet keys into `.env.local` (gitignored). Those are the well-known public Hardhat
development accounts: they hold no real value, exist only on the local chain, and are read
only by server-side code. **No real cryptocurrency is bought or spent by anything in this
repository.**

Restart `npm run dev` after deploying so the server picks up the new environment.

### Add live photograph analysis (optional)

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .env.local
npm run dev
```

Without a key, listing creation works in full and the app offers three clearly labelled
prerecorded example analyses. It never claims an uploaded photograph was analysed when it
was not.

### Reset

```bash
npm run db:reset                   # drop the database, migrate, re-seed
npm run db:reset -- --purge-uploads
```

If you reset the database while a chain is still holding older state, restart the node,
re-run `npm run chain:deploy`, then `npm run chain:anchor`.

---

## Demonstration accounts

Three **fictional** organizations are seeded. They are not real institutions and no
partnership with any named institution is implied. Password for all three is
`loopproof-demo`, or use the labelled entry buttons on `/signin`.

| Organization | Role | Account |
|---|---|---|
| Northfield Polytechnic — Surplus Office | donor | `rowan@northfield-poly.example` |
| Harbourside Community Learning Centre | recipient | `imani@harbourside-learning.example` |
| ReLoop Collective | donor and recipient | `sam@reloop-collective.example` |

The entry buttons create a real server-side session for that account. They do not change
the interface while leaving the backend thinking someone else is signed in: every
permission is re-read from the session on the server, and the API returns 403 if you try
to act outside your organization's role.

Public visitors need no account to browse approved listings or open any passport. Contact
details, exact collection addresses and private notes always require authorisation.

---

## What is live, local, example data, and optional

The running app shows this table at `/about`, filled in from the current environment.

| Area | Feature | Status |
|---|---|---|
| Accounts | Session auth with server-side organization permissions | **Live** |
| Accounts | Demo-account entry buttons | Example data (real sessions) |
| Listings | Persisted listings, photos, specs, condition evidence | **Live** |
| Listings | Photograph analysis producing a validated draft | **Live** with `ANTHROPIC_API_KEY` |
| Listings | Three prerecorded example analyses | Example data, used only with no key |
| Matching | Hard-rule eligibility with named blockers | **Live** |
| Matching | Semantic interpretation of plain-language requests | **Live** with `ANTHROPIC_API_KEY` |
| Matching | Distance between parties | **Live**, or reported unknown |
| Transfers | Request → reserve → release → receipt, plus cancel and dispute | **Live** |
| Transfers | Conflicting reservations prevented | **Live** |
| Evidence | Canonical public manifest, SHA-256 digest, version history | **Live** |
| Evidence | Tamper detection against the anchored digest | **Live** |
| Blockchain | Solidity registry, events, permissions, 17 contract tests | **Local development chain** |
| Blockchain | Anchoring acknowledgments and evidence digests | **Local development chain** |
| Blockchain | Local transaction detail view | **Local development chain** |
| Blockchain | Public testnet deployment | Optional, not configured |
| Blockchain | Simulation mode | Optional, off unless explicitly enabled |
| Impact | Confirmed transfer counts, mass, reported value | **Live** |
| Impact | Avoided-emissions estimate | **Withheld** — see below |

`GET /api/status` reports the same thing as JSON.

---

## Architecture

```
Browser ─► Next.js App Router (server components read the database directly)
              │
              ├─ route handlers under src/app/api        zod on every input
              │
              ├─ src/lib/db       SQLite + Drizzle, hand-written migrations
              ├─ src/lib/ai       Anthropic, tool-schema output, zod-validated
              ├─ src/lib/chain    viem → LoopProofRegistry on a local EVM
              │
              └─ src/lib/transfer-state.ts   one state machine, shared by all three
```

| Path | What lives there |
|---|---|
| `contracts/LoopProofRegistry.sol` | The shared registry contract |
| `test/contracts/` | 17 contract tests |
| `db/migrations/` | Hand-authored SQL, applied in order by `scripts/migrate.ts` |
| `src/lib/db/schema.ts` | Drizzle schema, mirroring the migrations |
| `src/lib/transfer-state.ts` | States, transitions, roles, item-status mapping |
| `src/lib/evidence-manifest.ts` | Canonicalisation, digest, covered/excluded field lists |
| `src/lib/items.ts` | Manifest building, snapshotting, publishing, verification |
| `src/lib/transfers.ts` | The two-party workflow and its anchoring |
| `src/lib/matching.ts` | Hard rules first, semantic reordering second |
| `src/lib/impact.ts` | Impact accounting and the emissions scenario |
| `tests/` | 57 service-level tests |

### Trust boundaries

**What LoopProof establishes.** That a specific public evidence document existed at a
specific time and has not changed since, because its digest is anchored. That two separate
organizations each recorded their own half of a handoff, in order, from their own
accounts. That a reservation could be held by only one recipient at a time. That a dispute
was raised, and by whom.

**What it cannot establish.** Whether the monitor actually powers on. Whether the van
really arrived. Whether the wallet signing as a university surplus office belongs to one.
On the local development chain the wallets are controlled by the demonstration
environment, so they attest to the environment, not to an organization's identity. There
is no independent identity verification here and the app says so wherever a wallet is
shown.

**Why a shared contract rather than one database.** Two organizations that do not share an
IT department need an account of a transfer that neither of them can quietly edit
afterwards. A row in the donor's own database is only as good as the donor's word. A
digest and two acknowledgments on a shared ledger can be checked by the recipient, by an
auditor, or by anyone with the passport link, without asking either party for permission.

**What stays off-chain.** All personal data, all raw images, request messages, collection
addresses and private notes. The chain holds a `bytes32` digest of the public manifest,
the manifest version string, two wallet addresses and timestamps.

### The transfer state machine

Defined once in `src/lib/transfer-state.ts` and used by the API, the interface and the
on-chain mapping, so the three cannot drift apart.

| Action | From | To | Who |
|---|---|---|---|
| `accept` | requested | reserved | donor |
| `decline` | requested | declined | donor |
| `withdraw` | requested | cancelled | recipient |
| `cancel` | reserved | cancelled | either party |
| `record_release` | reserved | released | donor |
| `record_receipt` | released | **completed** | recipient |
| `report_problem` | reserved / released / completed | disputed | either party |

`declined`, `completed`, `cancelled` and `disputed` are terminal. Cancelling returns the
item to the marketplace; the cancellation itself stays in the timeline and on chain. A
dispute preserves the acknowledgments recorded before it and permanently removes the
transfer from impact totals.

The contract mirrors this with `None, Registered, Reserved, Released, Completed, Disputed`
and enforces the same permissions, so a state change the backend rejects is also rejected
on chain.

### The evidence manifest

Version `lp-manifest-1`. Canonicalised as UTF-8 JSON with object keys sorted
lexicographically, array order preserved, no insignificant whitespace. SHA-256 over those
bytes is anchored as `bytes32`.

**Covered:** manifest version, item id, title, category, description, brand, model,
condition grade, quantity, mass and its basis, coarse location, known defects, confirmed
specifications (label, value, source), the test checklist, public condition-evidence
statements, and the SHA-256 of each public photograph with its caption.

**Never present:** contact email and phone, exact collection address, private operational
notes, request messages between parties, raw image bytes, unconfirmed AI suggestions, and
wallet private keys.

Changing a covered field creates a new manifest version; earlier versions are kept. If a
reservation is open when the evidence changes, the recipient must acknowledge the revised
evidence before receipt can be recorded. The contract refuses to move an anchor while an
item is mid-transfer, and the app explains that rather than reporting a bare failure.

Fetch `/api/items/<id>/manifest` to get the exact bytes and hash them yourself.

### Concurrency and reliability

- Reservation runs inside an `IMMEDIATE` SQLite transaction and re-checks availability
  inside it. Two partial unique indexes back this at the database level: one open request
  per (item, recipient), and at most one active reservation per item.
- A `CHECK` constraint refuses to store a transfer in state `completed` without both
  acknowledgment flags.
- Chain writes carry an idempotency key. A retry re-checks a pending transaction rather
  than sending a second one, and never re-sends a confirmed one.
- A chain failure never rolls back the acknowledgment the parties actually made. It is
  recorded as `failed` with the reason, and can be retried from the transfer page.
- Nothing is labelled confirmed before a transaction receipt says so. Nothing is ever
  labelled "simulated" unless `LOOPPROOF_CHAIN_SIMULATION=true` is set explicitly.
- Uploads are magic-byte sniffed, limited to JPEG/PNG/WebP and 6 MB each, at most three
  per listing. Stored filenames are generated, never taken from the client.
- The model API key and all wallet keys are read only in modules marked `server-only`.

### Honest impact accounting

Publishing a listing earns nothing. Only a transfer in state `completed` counts, which
requires both acknowledgments. Reservations, declines, cancellations and disputes are
counted separately and shown on the same page.

Mass is reported in two buckets, measured and estimated, never summed into one headline
figure. Items with no recorded mass are excluded rather than guessed at. Replacement value
is labelled as the owner's estimate unless a listing carries quoted evidence.

An avoided-emissions figure is produced **only** when every factor below exists in the
`impact_assumptions` table with a named source and version:

```
net avoided kg CO2e = (recorded mass kg × displaced-production factor × displacement rate)
                    − (units × (transport + refurbishment per unit))
```

In this build four of the five are deliberately marked unavailable, so **no CO₂e number is
shown** and `/impact` names exactly what is missing and why. Supplying defensible values
makes the figure appear, with its assumptions, scenario range and missing inputs alongside,
labelled "estimated under these assumptions" — never "certified carbon savings".

### Deploying a SQLite-backed build

The primary deliverable runs locally. If you host it, note that SQLite needs a **persistent
writable filesystem**, as does `LOOPPROOF_UPLOAD_DIR`. Serverless platforms with ephemeral
or read-only filesystems will lose both on every deploy and cannot run this build as-is;
use a persistent volume, or swap the Drizzle driver for a hosted database and move uploads
to object storage. Set `LOOPPROOF_SESSION_SECRET` and `LOOPPROOF_PUBLIC_BASE_URL` before
any shared deployment.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run setup` | Compile the contract, create the database, seed demo data |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:seed` | Seed demonstration data (no-op if already seeded) |
| `npm run db:reset` | Drop, migrate and re-seed; `-- --purge-uploads` also clears uploads |
| `npm run chain:node` | Local EVM development chain on port 8545 |
| `npm run chain:deploy` | Deploy the registry and write `.env.local` |
| `npm run chain:anchor` | Anchor every listing's current evidence manifest |
| `npm run chain:test` | 17 contract tests |
| `npm test` | 57 service-level tests |
| `npm run typecheck` | Type-check the app and the contract tests |
| `npm run verify:all` | typecheck + contract tests + service tests + production build |

---

## Sharing it with other people

The fastest way to put it in front of someone is a tunnel from your own machine, which
keeps the full stack including the working chain:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

For a permanent link, `render.yaml` and `fly.toml` are in the repository and there is a
`Dockerfile` that works on any container host. See [`docs/DEPLOY.md`](docs/DEPLOY.md) for
all four options and their trade-offs — in particular, SQLite needs a persistent writable
filesystem, so serverless platforms will not work without swapping the database driver.

---

## Further reading

- [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md) — how to drive the app as a donor and as a recipient
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — four ways to share it, and what each gives up
- [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md) — the four-minute demonstration, step by step
- [`docs/DEVPOST.md`](docs/DEVPOST.md) — submission draft
- [`docs/DIFFERENCES.md`](docs/DIFFERENCES.md) — how this differs from a conventional reuse marketplace
- [`docs/TESTING.md`](docs/TESTING.md) — what was actually tested, and the known limitations
