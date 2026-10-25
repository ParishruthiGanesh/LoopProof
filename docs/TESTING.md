# What was actually tested, and what was not

This file reports what was run, not what was intended. Figures are from the final
verification pass on the committed code.

## Automated

| Suite | Command | Result |
|---|---|---|
| Type checking (app + contract tests) | `npm run typecheck` | clean |
| Production build | `npm run build` | compiles, all 20 routes build |
| Contract tests | `npm run chain:test` | **17 passing** |
| Service-level tests | `npm test` | **58 passing**, 6 suites |

### Contract tests (`test/contracts/LoopProofRegistry.test.ts`)

Registration and duplicate rejection; rejection of an empty evidence hash; reservation by
a non-owner; release acknowledgment by a non-owner; receipt acknowledgment by a
non-recipient; acting on an unregistered item; reserving to the zero address or to the
owner; a second reservation while one is active; re-reservation only after an explicit
cancellation; cancellation by a third party; receipt before release; completion only with
both acknowledgments and the `TransferCompleted` event; repeated completion; a dispute
from `Released` leaving the earlier acknowledgment and its event intact; disputes from a
stranger or from `Registered`; digest match and mismatch; re-anchoring refused while a
transfer is in progress.

### Service tests (`tests/`)

- **evidence** (9) — canonicalisation independent of key order and whitespace; array order
  significant; stable digest; digest changes on any covered field; digest unchanged when a
  private field changes; no email, address or private note ever present in the manifest;
  unconfirmed AI suggestions excluded; tamper detected after a covered field changes;
  earlier manifest versions preserved and no new version for unchanged evidence; an
  unreachable chain distinguished from nothing being anchored.
- **transfer-state** (7) — the happy path in order; wrong role refused; wrong state
  refused; terminal states offer nothing (except disputing a completion); dispute allowed
  from reserved, released and completed; item-status mapping, including that a dispute
  moves the item nowhere; only `completed` counts for impact.
- **workflow** (15) — requesting your own listing; over-quantity; duplicate request from
  the same organization; a second organization may still request; a non-party action; a
  recipient accepting their own request; acceptance reserving and declining the competitor
  and then blocking a new request; receipt before release; completion only with both
  acknowledgments plus recipient-confirmed evidence written; double completion; receipt
  refused while re-acknowledgment is pending and allowed after a fresh confirmation;
  cancellation returning the item and retaining the timeline; a dispute preserving earlier
  acknowledgments; the database `CHECK` refusing a completed transfer missing either
  acknowledgment; honest degradation with no chain configured.
- **impact** (9) — only the seeded completed transfer counted; publishing earns nothing; a
  reservation earns nothing and one acknowledgment is not enough; quantity-weighted
  measured mass; measured and estimated buckets kept apart; an item with no mass excluded
  rather than guessed; a later dispute removing a completed transfer from the totals;
  seeded and real records separable; the CO₂e figure withheld with named missing inputs;
  a scenario with a range produced once every factor has a source.
- **matching** (8) — the strong match found with its reasons; incompatible candidates
  rejected with named blockers rather than ranked low; an organization never matched
  against itself; distance reported unknown without coordinates; missing specifications
  flagged rather than silently passed; a reserved item ineligible; results persisted;
  numeric and pixel comparisons.
- **ai** (10) — live analysis reported as off with instructions to enable it; a refusal to
  pretend an upload was analysed; examples served by name only and labelled; every shipped
  example satisfying the schema, carrying a `notAssessableFromPhoto` list and an ownership
  disclaimer, and wording damage as appearance; model output rejected when fields are
  missing, the category is invented or the title is over-long; empty brand/model
  normalised to `unknown`; `confidence` and `probability` stripped; ids the ranker was
  never given discarded; the prompts asserting untrusted-text handling, the
  no-invented-serials rule, the electrical-safety rule and the no-score rule.

## Scripted browser walkthrough

Driven with Playwright against a production build, the local chain running and no
`ANTHROPIC_API_KEY` set. Every step below passed on the final run.

1. Landing page renders.
2. Marketplace shows all 12 listings **without signing in**; the condition floor narrows
   it to 6.
3. A public passport renders, shows a **confirmed** anchor, and leaks no contact email and
   no collection address.
4. The QR endpoint returns an SVG.
5. In-page verification reports a match against the on-chain anchor.
6. An **altered copy** of the manifest produces a hash mismatch, with both digests shown;
   the genuine copy still matches.
7. The recipient demo account signs in and lands on its own overview.
8. The recipient is refused listing creation in the interface **and by the API (403)**.
9. The request page ranks the strong match with reasons and rejects incompatible
   candidates with named blockers.
10. Two organizations submit competing requests for the same item.
11. The donor accepts one: reserved **confirmed on chain**, the competitor visibly declined.
12. The third organization is blocked from reserving, in the interface **and by the API
    (409)**.
13. A non-party is refused any action on the transfer **(403)**.
14. The donor records release, confirmed on chain.
15. The donor **cannot** record the recipient's receipt **(409)**.
16. The recipient records receipt: completed with both acknowledgments, confirmed on chain.
17. The passport shows the completed transfer, both acknowledgments, and the
    recipient-confirmed evidence.
18. The local transaction detail view reads a successful receipt from the node.
19. The impact page counts only confirmed transfers, withholds the CO₂e figure with
    reasons, and separates seeded examples from real activity.
20. A **real photograph upload** is accepted; a labelled prerecorded example loads with an
    explicit "your uploads were not analysed" disclaimer.
21. Publishing stays blocked while suggestions are unconfirmed and questions unanswered.
22. The listing publishes from that real upload and anchors: **confirmed** on the local
    chain (`POST /api/listings` → 201, `anchorStatus: "confirmed"`).
23. No horizontal overflow at 390px on the landing, marketplace, passport and impact pages.
24. The first Tab stop is the skip link; focus moves through the navigation with a visible
    outline; the marketplace search submits from the keyboard alone.

## Degraded-mode checks

**No `ANTHROPIC_API_KEY`** (the default in this environment, and the mode all of the above
ran in): the banner says "AI analysis: example mode (no API key)", the **Analyse
photographs** button is disabled with the reason stated, listing creation remains fully
usable, and three labelled examples are offered. `analyzePhotos` returns an explicit
refusal rather than a fabricated result.

**Blockchain RPC unavailable** — tested by killing the node mid-session:

- A reservation attempt records `Blockchain status: failed` with the RPC error, and is
  **never** reported as confirmed.
- The off-chain acknowledgment still stands; the transfer moved to `reserved` and the
  failed anchor row offers a retry.
- `GET /api/status` reports `chain.reachable: false` with the error.
- The environment banner reports "Chain: not reachable".
- The passport says **"could not reach the chain to check"**, not "nothing registered" —
  these are different facts and the app no longer conflates them.
- In-page verification reports "Anchor not checked — chain unreachable" and states that
  this is **an incomplete check, not a pass**.

**Idempotent retry** — tested by anchoring against an address with no contract, then
retrying with the real one:

- The first attempt is recorded `failed` with a message naming the address and the fix.
- Retrying with the same idempotency key succeeds, reuses the same database row, and
  leaves exactly one row with `attempts` incremented to 2.
- Retrying a confirmed action sends nothing and reports `deduplicated`, with the
  transaction hash unchanged.
- Re-settling a confirmed row keeps it confirmed.
- `npm run chain:anchor` run twice reports `0 anchored, 12 already anchored`.

A weakness found and fixed during this testing: a send to an address with no contract code
returns a *successful* receipt, so an anchor to a wrong address would have been marked
confirmed. `anchor()` now checks for contract code and simulates the call before sending,
so a call the contract would reject fails with the contract's own error and nothing bogus
is ever marked confirmed.

## Known limitations

- **No automated accessibility audit.** Contrast, focus order, skip link, labelled
  controls, non-colour status indicators and table captions were built in and spot-checked
  by hand and by the scripted keyboard checks, but no axe or Lighthouse run was performed.
- **No screen-reader testing.**
- **Live photograph analysis was not exercised against the real API**, because no
  `ANTHROPIC_API_KEY` exists in this environment. The request construction, the tool
  schema, the zod validation, the error and timeout paths and the untrusted-text prompt
  rules are covered by unit tests, and the no-key path is covered end to end — but the
  live round trip is unverified.
- **Semantic matching is likewise unverified live**, for the same reason. The rule-based
  path and the "semantic unavailable" messaging are tested.
- **Local chain only.** No testnet deployment was attempted and no real funds were
  involved anywhere.
- **Concurrency is tested logically, not under real parallel load.** The guards are an
  `IMMEDIATE` transaction, two partial unique indexes, a `CHECK` constraint and a
  contract-level state check; the tests exercise the sequential paths through them rather
  than racing two simultaneous HTTP requests.
- **No load or performance testing.** The seeded dataset is 12 listings.
- **Browser coverage is Chromium only.**
- **Mobile checks are layout and overflow only** at 390px; no touch-gesture or real-device
  testing.
- **`npm run db:reset` does not reset the chain.** If you reset the database while a node
  is still holding older state, an item that is mid-transfer on chain cannot be re-anchored
  — correct behaviour, but it needs a node restart and redeploy. The app and the anchor
  script both say so.
