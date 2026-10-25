import Link from "next/link";
import { aiStatus } from "@/lib/ai";
import { rpcHealth } from "@/lib/chain";
import { MANIFEST_COVERED_FIELDS, MANIFEST_EXCLUDED_FIELDS, MANIFEST_VERSION } from "@/lib/evidence-manifest";
import { TRANSITIONS, STATE_LABELS, type TransferAction } from "@/lib/transfer-state";
import { Card, SectionHeading, Badge, Callout, Prose } from "@/components/ui";

export const metadata = { title: "How it works" };

type Status = "live" | "local" | "example" | "optional";

const STATUS_BADGE: Record<Status, { tone: "forest" | "mint" | "amber" | "outline"; glyph: string; label: string }> = {
  live: { tone: "forest", glyph: "●", label: "Live feature" },
  local: { tone: "mint", glyph: "⛓", label: "Local development" },
  example: { tone: "amber", glyph: "◆", label: "Example data" },
  optional: { tone: "outline", glyph: "○", label: "Optional integration" },
};

const FEATURES: Array<{ area: string; feature: string; status: Status; detail: string }> = [
  { area: "Accounts", feature: "Session-based authentication with server-side organization permissions", status: "live", detail: "Signed httpOnly cookie over a server-side session table. Every write re-reads the organization from the session." },
  { area: "Accounts", feature: "Demo-account entry buttons", status: "example", detail: "Creates a real session for a seeded account. It does not bypass any backend check." },
  { area: "Listings", feature: "Persisted listings, photos, specifications, condition evidence", status: "live", detail: "SQLite via Drizzle. Photo uploads are magic-byte sniffed, size-limited and stored outside the repository." },
  { area: "Listings", feature: "Photograph analysis producing a validated draft listing", status: "live", detail: "Server-side Anthropic call with a tool schema, validated with zod before anything is shown. Requires ANTHROPIC_API_KEY." },
  { area: "Listings", feature: "Prerecorded example analyses", status: "example", detail: "Three labelled samples, used only when no API key is set. Never presented as the result of analysing your upload." },
  { area: "Matching", feature: "Hard-rule eligibility with named blockers", status: "live", detail: "Category, availability, quantity, condition floor, deadline, cables and required specifications. Failures are rejected, not ranked low." },
  { area: "Matching", feature: "Semantic interpretation of plain-language requests", status: "live", detail: "Reorders already-eligible candidates and attaches a reason. Requires ANTHROPIC_API_KEY; falls back to rule-based ordering with a visible note." },
  { area: "Matching", feature: "Distance between parties", status: "live", detail: "Great-circle distance between region centroids, only when both sides have coordinates. Otherwise reported as unknown." },
  { area: "Transfers", feature: "Request, accept, reserve, release, receipt, cancel, dispute", status: "live", detail: "One transition table shared by the API, the UI and the contract mapping." },
  { area: "Transfers", feature: "Conflicting reservations prevented", status: "live", detail: "IMMEDIATE transaction plus a partial unique index on the transfers table, plus a contract-level state check." },
  { area: "Evidence", feature: "Canonical public evidence manifest and SHA-256 digest", status: "live", detail: `Manifest version ${MANIFEST_VERSION}. Versions are kept, so evidence history survives a listing change.` },
  { area: "Evidence", feature: "Tamper detection against the anchored digest", status: "live", detail: "Recompute from the page, or hash a document you supply and compare. Both read-only." },
  { area: "Blockchain", feature: "Solidity registry contract with events and permissions", status: "local", detail: "contracts/LoopProofRegistry.sol, 17 contract tests covering unauthorized actions, conflicting reservations and completion requirements." },
  { area: "Blockchain", feature: "Anchoring acknowledgments and evidence digests", status: "local", detail: "Runs against a Hardhat node on chainId 31337. Each organization signs with its own development wallet, held server-side only." },
  { area: "Blockchain", feature: "Local transaction detail view", status: "local", detail: "Reads receipts straight from the node, because a local chain has no public explorer." },
  { area: "Blockchain", feature: "Public testnet deployment", status: "optional", detail: "Not configured and not required. An RPC URL and a funded key would be needed; no real funds are spent by this prototype." },
  { area: "Blockchain", feature: "Simulation mode", status: "optional", detail: "Off unless LOOPPROOF_CHAIN_SIMULATION=true is set explicitly. Nothing is ever labelled 'simulated' otherwise." },
  { area: "Impact", feature: "Confirmed completed-transfer metrics, mass and value", status: "live", detail: "Computed from persisted data, with measured and estimated figures kept apart and seeded records filterable." },
  { area: "Impact", feature: "Avoided-emissions estimate", status: "optional", detail: "Withheld in this build. Four of the five required factors have no defensible source, and the page says which." },
];

export default async function AboutPage() {
  const [ai, chain] = await Promise.all([Promise.resolve(aiStatus()), rpcHealth()]);

  return (
    <div className="mx-auto max-w-4xl space-y-9">
      <SectionHeading
        level={1}
        title="How LoopProof works"
        description="Architecture, trust boundaries, and exactly which parts are live in this environment."
      />

      {/* ------------------------------------------------- trust boundary */}
      <Card className="p-5 sm:p-6">
        <h2 className="text-lg">The trust boundary</h2>
        <Callout tone="warn" title="What LoopProof does not prove">
          LoopProof records acknowledgments and detects changes to anchored evidence. It does not independently
          prove that an item works, that a physical handoff occurred, or that the same object was not registered
          under a different identity.
        </Callout>
        <Prose>
          <p className="mt-4">
            <strong>What it does establish.</strong> That a specific public evidence document existed at a
            specific time and has not changed since, because its digest is anchored. That two separate
            organizations each recorded their own half of a handoff, in order, from their own accounts. That a
            reservation could only be held by one recipient at a time. That a dispute was raised, and by whom.
          </p>
          <p>
            <strong>What it cannot establish.</strong> Whether the monitor actually powers on. Whether the van
            really arrived. Whether the wallet signing as a university surplus office belongs to one. On the
            local development chain used here, the wallets are controlled by the demonstration environment, so
            they attest to the environment, not to an organization&rsquo;s identity.
          </p>
          <p>
            <strong>Why a shared contract rather than one database.</strong> Two organizations that do not
            share an IT department need an account of a transfer that neither of them can quietly edit
            afterwards. A row in the donor&rsquo;s own database is only as good as the donor&rsquo;s word. A
            digest and two acknowledgments on a shared ledger can be checked by the recipient, by an auditor,
            or by anyone with the passport link, without asking either party for permission.
          </p>
          <p>
            <strong>What stays off-chain.</strong> All personal data, all raw images, request messages,
            collection addresses, and private notes. The chain holds a <code className="lp-mono">bytes32</code>{" "}
            digest of the public manifest, the manifest version string, two wallet addresses, and timestamps.
          </p>
        </Prose>
      </Card>

      {/* ---------------------------------------------------- state machine */}
      <Card className="p-5 sm:p-6">
        <h2 className="text-lg">The transfer state machine</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Defined once in <code className="lp-mono">src/lib/transfer-state.ts</code> and used by the API, the
          interface, and the on-chain mapping, so the three cannot drift apart.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Permitted transfer state transitions</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th scope="col" className="py-2 pr-4 font-semibold">Action</th>
                <th scope="col" className="py-2 pr-4 font-semibold">From</th>
                <th scope="col" className="py-2 pr-4 font-semibold">To</th>
                <th scope="col" className="py-2 font-semibold">Who may do it</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(TRANSITIONS) as TransferAction[]).flatMap((action) =>
                TRANSITIONS[action].map((transition) => (
                  <tr key={`${action}-${transition.from}`} className="border-b border-line/60">
                    <td className="py-2 pr-4 lp-mono">{action}</td>
                    <td className="py-2 pr-4">{STATE_LABELS[transition.from]}</td>
                    <td className="py-2 pr-4 font-medium">{STATE_LABELS[transition.to]}</td>
                    <td className="py-2">{transition.allowedRoles.join(" or ")}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <Prose>
          <p className="mt-4">
            <code className="lp-mono">declined</code>, <code className="lp-mono">completed</code>,{" "}
            <code className="lp-mono">cancelled</code> and <code className="lp-mono">disputed</code> are
            terminal. A cancelled reservation returns the item to the marketplace; the cancellation itself stays
            in the timeline and on chain. A dispute from any state preserves the acknowledgments recorded before
            it, and permanently removes the transfer from impact totals.
          </p>
          <p>
            The contract mirrors this with its own enum —{" "}
            <code className="lp-mono">None, Registered, Reserved, Released, Completed, Disputed</code> — and
            enforces the same permissions on chain, so a state change rejected by the backend is also rejected
            by the contract.
          </p>
        </Prose>
      </Card>

      {/* ------------------------------------------------------ manifest */}
      <Card className="p-5 sm:p-6">
        <h2 className="text-lg">The evidence manifest</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Version <code className="lp-mono">{MANIFEST_VERSION}</code>. Canonicalised as UTF-8 JSON with object
          keys sorted lexicographically, array order preserved, and no insignificant whitespace. SHA-256 over
          those bytes is anchored as <code className="lp-mono">bytes32</code>.
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-forest-700">Covered by the digest</h3>
            <ul className="mt-2 space-y-1 text-sm text-ink-soft">
              {MANIFEST_COVERED_FIELDS.map((field) => (
                <li key={field} className="lp-mono">
                  ✓ {field}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-clay">Never in the manifest</h3>
            <ul className="mt-2 space-y-1 text-sm text-ink-soft">
              {MANIFEST_EXCLUDED_FIELDS.map((field) => (
                <li key={field}>✕ {field}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 text-sm text-ink-soft">
          Changing a covered field creates a new manifest version. Earlier versions are kept, and if a
          reservation is open when the evidence changes, the recipient is required to acknowledge the revised
          evidence before receipt can be recorded.
        </p>
      </Card>

      {/* ------------------------------------------------- feature status */}
      <Card className="p-5 sm:p-6">
        <h2 className="text-lg">What is live, local, example data, or optional</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {ai.liveEnabled ? (
            <Badge tone="forest" glyph="●">
              Photograph analysis: live ({ai.model})
            </Badge>
          ) : (
            <Badge tone="amber" glyph="○">
              Photograph analysis: example mode, no API key configured
            </Badge>
          )}
          {chain.simulationMode ? (
            <Badge tone="amber" glyph="◇">
              Chain: simulation mode enabled
            </Badge>
          ) : chain.reachable && chain.contractDeployed ? (
            <Badge tone="mint" glyph="⛓">
              Chain: reachable, contract deployed at block {chain.blockNumber}
            </Badge>
          ) : (
            <Badge tone="amber" glyph="○">
              Chain: {chain.configured ? "configured but unreachable" : "no contract address configured"}
            </Badge>
          )}
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Feature status table</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th scope="col" className="py-2 pr-4 font-semibold">Area</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Feature</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
                <th scope="col" className="py-2 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((row) => {
                const badge = STATUS_BADGE[row.status];
                return (
                  <tr key={`${row.area}-${row.feature}`} className="border-b border-line/60 align-top">
                    <td className="py-2.5 pr-4 text-ink-muted">{row.area}</td>
                    <th scope="row" className="py-2.5 pr-4 text-left font-medium">
                      {row.feature}
                    </th>
                    <td className="py-2.5 pr-4">
                      <Badge tone={badge.tone} glyph={badge.glyph}>
                        {badge.label}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-ink-soft">{row.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ------------------------------------------- how this differs */}
      <Card className="p-5 sm:p-6">
        <h2 className="text-lg">How this differs from a conventional reuse marketplace</h2>
        <Prose>
          <p className="mt-3">
            Plenty of reuse listing sites exist, and LoopProof does not claim to be the first. The difference is
            narrower and, we think, more useful: a conventional marketplace treats the listing as the product
            and the handoff as something that happens off-platform. Once an item is marked &ldquo;gone&rdquo;,
            whatever was claimed about its condition is unverifiable and the record lives in one
            organization&rsquo;s database.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Claims carry their provenance.</strong> Every specification and condition statement is
              labelled owner-reported, documented-test or recipient-confirmed, and the distinction survives into
              the public record. A model&rsquo;s suggestion is explicitly unconfirmed until a person ticks it.
            </li>
            <li>
              <strong>Eligibility is a rule, not a ranking.</strong> An item that fails a stated requirement is
              rejected with the reason named, rather than shown as a weaker match. A near-miss is not promoted.
            </li>
            <li>
              <strong>Completion needs two parties.</strong> Neither organization can close a transfer alone.
              The handoff, not the listing, is the thing that gets recorded.
            </li>
            <li>
              <strong>The record outlives the platform&rsquo;s goodwill.</strong> A digest of the public
              evidence and both acknowledgments sit on a shared contract. If the evidence is later edited, the
              passport says so, and anyone can recompute the digest themselves from a published canonical
              document.
            </li>
            <li>
              <strong>Impact is withheld rather than invented.</strong> Publishing earns nothing. A CO₂e figure
              appears only when every factor behind it has a named source and version; in this build four of
              five do not, so no figure is shown and the page says which are missing.
            </li>
          </ul>
          <p>
            None of this makes reuse verifiable in a strong sense. It makes the paper trail of a transfer
            checkable by the other party, which is the part that currently goes missing.
          </p>
        </Prose>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg">Architecture at a glance</h2>
        <Prose>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>
              <strong>Next.js App Router, TypeScript.</strong> Pages are server components reading the database
              directly; mutations go through route handlers under <code className="lp-mono">src/app/api</code>.
            </li>
            <li>
              <strong>SQLite with Drizzle.</strong> Hand-authored migrations in{" "}
              <code className="lp-mono">db/migrations</code>. Reservation safety uses an IMMEDIATE transaction
              plus partial unique indexes.
            </li>
            <li>
              <strong>Service interfaces.</strong> Database, AI and chain access each sit behind a small module
              (<code className="lp-mono">src/lib/db</code>, <code className="lp-mono">src/lib/ai</code>,{" "}
              <code className="lp-mono">src/lib/chain</code>), so a failure in one is handled rather than
              propagated.
            </li>
            <li>
              <strong>Validation twice.</strong> zod on every API input, and zod again on every model response
              before it is shown or stored.
            </li>
            <li>
              <strong>Secrets stay server-side.</strong> The model API key and all wallet keys are read only in
              server modules marked <code className="lp-mono">server-only</code>. Nothing is committed.
            </li>
          </ul>
          <p>
            Full setup instructions, the demo script and the data model are in the repository README. The{" "}
            <Link href="/api/status">status endpoint</Link> reports what is live right now.
          </p>
        </Prose>
      </Card>
    </div>
  );
}
