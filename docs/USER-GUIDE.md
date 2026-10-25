# Using LoopProof

What each page is for, and how to drive the app as a donor and as a recipient.

## The one idea

Two organizations who do not share an IT department need to agree that a physical item
changed hands, and what condition it was in. LoopProof is the paper trail for that: a
listing, a request, a reservation, two acknowledgments, and a public passport anyone can
check.

---

## Sign in

Open `/signin`. There are three **fictional** organizations, each with a one-click button:

| Organization | Can it donate? | Can it receive? |
|---|---|---|
| Northfield Polytechnic — Surplus Office | yes | no |
| Harbourside Community Learning Centre | no | yes |
| ReLoop Collective | yes | yes |

The roles are enforced on the server. Signed in as Harbourside, the listing form is not
just hidden — `POST /api/listings` returns **403**.

**To see both sides at once, use two browser windows**: one normal, one private/incognito.
Sessions are per-browser-profile, so you can be the donor in one and the recipient in the
other and watch the same transfer from both.

---

## As a donor

### 1. List something — `/listings/new`

**Step 1, photograph it.** Choose up to three images (JPEG/PNG/WebP, 6 MB each). On a
phone this opens the camera.

Then one of two things, depending on your environment:

- **Live mode** (an `ANTHROPIC_API_KEY` is set): click **Analyse photographs**. A draft
  comes back — title, category, visible brand and model, visible specifications with where
  each was read from, visible damage worded as appearance only, and a list of things a
  photograph cannot establish.
- **Example mode** (no key): the **Analyse photographs** button is disabled and says why.
  Click one of the three **Example A/B/C** buttons instead. These are prerecorded samples
  shipped with the app; it tells you plainly that your own upload was not analysed.

**Step 2, answer what a photograph cannot show.** Tick each question once you have
recorded the answer below. The publish button stays disabled until you have.

**Step 3, confirm the listing.** This is the part that matters:

- **Every suggested specification has a confirm checkbox.** Anything you do not tick is
  stored as *AI suggested, unconfirmed* and is left out of the public evidence manifest
  entirely. Publishing is blocked while any remain unconfirmed — confirm them, correct
  them, or remove them.
- **Condition grade.** "Untested" is an honest answer and recipients can filter for it.
- **Weight needs a basis.** Enter a weight and say whether it was *measured* or
  *estimated*, or leave it blank. The form refuses a number with no basis, and the impact
  page keeps the two in separate buckets forever after.
- **Testing checklist.** Powers on, display works, ports, cables. If you tested anything,
  this becomes *documented test* evidence; if not, it is recorded as *owner reported*.
- **General location is public; the exact collection address is not.** The address is
  released only to the recipient who holds the reservation.

Click **Publish listing and anchor its evidence**. You get the manifest version, its
SHA-256 digest, and the anchor status.

### 2. Field requests

Requests appear on `/dashboard` under **Transfers awaiting action**, and on the listing
page itself. Open the transfer and choose:

- **Accept request and reserve item** — reserves it for that recipient and visibly
  declines the others. Watch the result line: it names the new state and the blockchain
  status.
- **Decline request** — closes that one; the item stays available.

### 3. Hand it over

When the recipient collects it, open the transfer and click **Record release of item**.
That is your half of the acknowledgment. You cannot record the recipient's half — try it
and the API returns **409**.

---

## As a recipient

### 1. Say what you need — `/requests`

Fill in both halves:

- **Your own words.** "We are setting up four workstations for an evening class…"
  When a model key is configured this is what semantic matching interprets.
- **Structured requirements** — category, quantity, lowest acceptable condition, deadline,
  distance, whether cables must be included, and any required specifications.

Required specifications accept simple comparisons: `>=1920`, `1920x1080`, or plain text
that must appear.

### 2. Read the matches — `/requests/<id>`

Two lists, and the split is the point:

- **Suggested matches** — each one shows *why it matches*, item by item, and
  *limitations and missing information* where the listing does not say something you asked
  about.
- **Incompatible candidates** — rejected, with the blocking reason named: "Condition
  'For parts only' is below the stated floor", "Only 1 available; the request needs 4".

There is no match percentage anywhere, deliberately: there is no justified way to compute
one, so the app gives ordering and reasons instead.

### 3. Request an item

From any listing, **Submit request** with a quantity and a message. You can link it to one
of your open requests so the donor can see your published requirements.

If another organization already holds the reservation, the page says so and the request
button is gone — and the API returns **409** if you try anyway.

### 4. Receive it

Once the donor records release, open the transfer and choose:

- **Record receipt and confirm condition** — tick *the item matched the published
  condition*, add a note. This completes the transfer and writes **recipient confirmed**
  evidence onto the item, which is the strongest evidence grade in the system.
- **Report a problem** — if it did not match. The transfer becomes **disputed**, is
  permanently excluded from impact totals, and the acknowledgments already recorded stay
  on the record. Nothing is erased.

If the donor changed the listing's public evidence after you were given the reservation,
you will be asked to review and confirm the revised evidence before receipt can be
recorded.

---

## The pages

| Page | What it is for |
|---|---|
| `/dashboard` | Your organization's overview: available equipment, what is waiting on you, open requests you could meet, completed transfers |
| `/marketplace` | Public. Search and filter by category, condition floor, availability, area, and whether a record is seeded or real |
| `/marketplace/<id>` | Full listing: specifications with their evidence basis, testing checklist, condition evidence, request button |
| `/requests` | All open requests, and the form to post one |
| `/requests/<id>` | Ranked matches with reasons, and incompatible candidates with blockers |
| `/transfers` | Every transfer you are party to, grouped by what needs doing |
| `/transfers/<id>` | The shared workspace: timeline, acknowledgments, blockchain record, your available actions |
| `/passport/<item id>` | **Public.** QR code, evidence, transfer history, anchor status, and the tamper check |
| `/impact` | Confirmed completed reuse, what is deliberately not counted, and every assumption |
| `/about` | Architecture, trust boundaries, and which features are live right now |
| `/api/status` | The same feature status as JSON |

---

## The passport and the tamper check

`/passport/LP-MON-K4T2PQ` is public — no sign-in. It shows the condition evidence, the
transfer timeline with both acknowledgments, and the anchor status. Wallet addresses and
transaction hashes are tucked into expandable sections so an ordinary user never has to
look at them.

At the bottom, **Check this evidence** has two buttons worth understanding:

1. **Check the evidence on this page** — recomputes the digest from what is displayed and
   compares it with the stored manifest and the on-chain anchor.
2. **Load an altered copy**, then **Hash it and compare with the anchor** — loads the real
   manifest with the condition grade quietly improved, and shows the hash mismatch with
   both digests side by side. The item's real evidence is untouched; the *document* is
   what fails.

That second one is the clearest 20 seconds in the whole demo.

---

## Reading the banner

The dark green strip at the top always states what is actually switched on.

**AI analysis:**

- `live` — photographs are sent to the model from the server.
- `example mode (no API key)` — no `ANTHROPIC_API_KEY` is set. Your uploads are **not**
  analysed, listing creation still works in full by hand, and three labelled example
  analyses are offered. Set a key in `.env.local` and restart to switch it on.

**Chain:**

- `Local development chain (Hardhat, chainId 31337)` — connected, contract deployed.
- `no contract configured` — no `LOOPPROOF_CONTRACT_ADDRESS`. Run `npm run chain:deploy`.
- `not reachable` — configured, but the node is not answering. Run `npm run chain:node`.
- `no contract at the configured address` — the address is set but holds no code; redeploy.
- `simulation mode` — only ever appears if you explicitly set `LOOPPROOF_CHAIN_SIMULATION=true`.

---

## Evidence grades

Shown next to every claim in the app:

| Badge | Means |
|---|---|
| ★ **Recipient confirmed** | The receiving organization checked it on arrival. Strongest. |
| ✓ **Documented test** | Someone tested it and recorded the result. |
| • **Owner reported** | The owner says so. Not independently tested. |
| ? **AI suggested, unconfirmed** | Read from a photograph, not yet confirmed. Excluded from the public manifest and the anchored digest. |

---

## Resetting

```bash
npm run db:reset                    # back to the seeded state
npm run db:reset -- --purge-uploads # also delete uploaded photographs
```

If a chain node is running from an earlier session, restart it and re-run
`npm run chain:deploy` then `npm run chain:anchor` — the database and the chain reset
independently.
