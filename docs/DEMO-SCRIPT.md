# LoopProof — four-minute demonstration

**Tagline:** Give equipment a second life. Keep the proof.

## Before you start

Three terminals, in this order:

```bash
npm run chain:node       # terminal 1 — leave running
npm run chain:deploy     # terminal 2 — writes .env.local
npm run chain:anchor     # terminal 2 — anchors the seeded listings
npm run dev              # terminal 3 — http://localhost:3000
```

Open three browser windows (or one window and two private windows) so you can hold three
sessions at once:

| Window | Signed in as | Starting page |
|---|---|---|
| **A — donor** | Northfield Polytechnic — Surplus Office | `/dashboard` |
| **B — recipient** | Harbourside Community Learning Centre | `/requests/REQ-H4TK2M` |
| **C — third party** | ReLoop Collective | `/marketplace/LP-MON-T6LN8V` |

Use the labelled entry buttons on `/signin`. Have a photograph of a monitor ready on the
machine driving window A (any JPEG, PNG or WebP under 6 MB).

Check the banner at the top of every page before you begin: it states whether photograph
analysis is live and whether the chain is reachable. Say out loud which mode you are in.

---

## The script

### 0:00 — A monitor waiting for a second use (20s)

> "A department has a working 27-inch monitor it no longer needs. Someone three miles away
> is setting up a classroom. Today, that match happens by email, or not at all — and
> afterwards nobody can show what was handed over or what condition it was in."

Window A, `/dashboard`. Point at the two counters: *awaiting your action* and *completed
transfers*. Note the demonstration-data badges — seeded examples are labelled everywhere
and never mixed into real totals.

### 0:20 — Photograph it, and get a draft back (45s)

Window A → **List surplus equipment**.

Upload the photograph. Then:

- **If `ANTHROPIC_API_KEY` is set:** click **Analyse photographs**. A draft title,
  category, visible brand and model, and visible specifications come back, each with where
  in the image it was read from.
- **If it is not set:** say so plainly — *"no model key in this environment, so my upload
  was not analysed; here is a prerecorded example to show the shape of the output"* — and
  click **Example A**. The app states this itself in an amber banner.

> "It never claims the monitor works. It lists what it could not read, and asks the owner
> the questions a photograph cannot answer."

Scroll to **Not assessable from a photograph**: whether it powers on, panel defects,
electrical safety, who owns it.

### 1:05 — Confirm the specifications and the condition (45s)

> "Nothing publishes until a person confirms it."

- Tick each suggested specification. Point out that the publish button stays disabled, and
  the warning says why: *"3 suggestions not yet confirmed"*.
- Acknowledge the questions.
- Set the condition grade, enter a weight and choose **measured** or **estimated** — note
  that the app refuses a weight without a basis.
- Fill the testing checklist: powers on, display works, ports, cables.

Click **Publish listing and anchor its evidence**. The result panel shows the evidence
manifest version, its SHA-256 digest, and `Anchor status: confirmed`.

### 1:50 — The classroom's request, and why this matches (40s)

Window B, `/requests/REQ-H4TK2M` — *"Four monitors for an adult digital-skills classroom"*.

Point at the two halves: the recipient's own words, and the structured requirements
checked as hard rules.

Scroll to **Suggested matches**. For the top candidate, read the **Why it matches** list:
category, quantity, the resolution requirement met by a documented test, cables recorded
as included, distance between region centroids.

Then scroll to **Incompatible candidates**:

> "The cracked parts-only panel is not ranked low. It is rejected, and the reason is
> named: condition below the stated floor. A near-miss never gets promoted into a match."

### 2:30 — Accept, reserve, and watch the conflict (35s)

Window B → open a listing and **Submit request**.

Window C → request the **same** item. Both requests are now open.

Window A → open the transfer → **Accept request and reserve item** → confirm.

The result line reads: moved from requested to reserved, *Blockchain status: confirmed*,
*1 other request was declined*.

Window C → reload. It now says the item is reserved and that only one reservation can
exist at a time.

> "That is not just the interface hiding a button — the API returns 409, the database has a
> partial unique index on active reservations, and the contract reverts."

### 3:05 — Both sides have to sign (30s)

Window A → **Record release of item** → confirm. Point at the acknowledgments panel: one
recorded, one not.

> "The donor cannot finish this alone. If they try, the API returns 409."

Window B → **Record receipt and confirm condition**. Tick *the item matched the published
condition*, add a note, confirm.

Both acknowledgments are now recorded and the transfer is **completed**, confirmed on
chain. The recipient's confirmation has become `recipient confirmed` evidence on the item.

### 3:35 — The passport, and the tamper check (20s)

Open `/passport/<item id>` — or scan the QR code on screen with a phone.

Show, quickly: the transfer timeline, both acknowledgments, the anchor status, and the
expandable technical section with the wallet addresses and transaction hash.

Then the headline move. In **Check this evidence**:

1. **Check the evidence on this page** → *matches the on-chain anchor*.
2. **Load an altered copy** → the condition grade and defects are quietly improved in a
   copy → **Hash it and compare with the anchor** → **Hash mismatch**, with both digests
   shown side by side.

> "The anchor is unchanged. The document is what failed."

### 3:55 — Impact, with its assumptions on the table (25s)

`/impact`. Switch the scope tab to **Created in this app**.

> "One completed transfer. Mass is reported in two buckets — measured and estimated — never
> added together. And there is no CO₂e number here."

Scroll to the emissions section:

> "Four of the five factors it would need have no defensible source yet, and the page says
> which. Inventing a convenient emissions factor would make the number worse than no
> number. The moment a real factor goes in the assumptions table, the figure appears with
> its range and its gaps attached."

Close on the footer line:

> "LoopProof records acknowledgments and detects changes to anchored evidence. It does not
> prove the monitor works, that the van arrived, or that the same object was not registered
> twice. That is the honest boundary — and inside it, two organizations who share no IT
> department now have a record neither of them can quietly edit."

---

## If something goes wrong on stage

| Symptom | What to say and do |
|---|---|
| Chain banner says *not reachable* | "The anchoring layer is offline — watch what the app does." Everything still works; statuses read **Not anchored** or **Failed**, never confirmed. Restart `npm run chain:node`, then retry from the transfer page. |
| Anchor status reads **Failed** | Open the transfer, expand the transaction detail, click **Retry anchoring**. It reuses the same idempotency key, so nothing is ever sent twice. |
| AI banner says *example mode* | Say it out loud and use the example buttons. The rest of the workflow is unaffected. |
| An item is already reserved from an earlier run | `npm run db:reset`, restart the node, `npm run chain:deploy`, `npm run chain:anchor`. |

## The ten beats, in one line each

1. A monitor awaiting a second use → `/dashboard`
2. Upload its photo and generate a draft → `/listings/new`
3. Confirm specifications and condition → same page, publish blocked until confirmed
4. Open the classroom's request and explain the match → `/requests/REQ-H4TK2M`
5. Accept the request and reserve the monitor → transfer workspace
6. Show that another organization cannot reserve it → window C
7. Record donor release and recipient receipt → transfer workspace, both windows
8. Open the QR-linked passport and the confirmed chain record → `/passport/<id>`
9. Alter a copy of the evidence and show the hash mismatch → same page
10. Completed-transfer metrics with labelled assumptions → `/impact`
