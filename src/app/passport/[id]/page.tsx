import Link from "next/link";
import { notFound } from "next/navigation";
import { loadItemView } from "@/lib/items";
import { publicTransferHistory } from "@/lib/transfers";
import { readOnChainItemResult, CHAIN_STATE_NAMES } from "@/lib/chain";
import { itemIdToBytes32, MANIFEST_COVERED_FIELDS, MANIFEST_EXCLUDED_FIELDS } from "@/lib/evidence-manifest";
import { labelCategory, labelCondition } from "@/lib/matching";
import {
  Card,
  SectionHeading,
  Badge,
  Callout,
  KeyValue,
  EvidenceBadge,
  ItemStatusBadge,
  TransferStateBadge,
  ChainStatusBadge,
  DemoBadge,
  RealBadge,
  Disclosure,
} from "@/components/ui";
import { ChecklistTable } from "@/components/checklist-table";
import { TransferTimeline } from "@/components/transfer-timeline";
import { EvidenceChecker } from "@/components/evidence-checker";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadItemView(id);
  return { title: view ? `Passport · ${view.item.title}` : "Passport not found" };
}

export default async function PassportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadItemView(id);
  if (!view) notFound();

  const [history, chainRead] = await Promise.all([
    publicTransferHistory(id),
    readOnChainItemResult(itemIdToBytes32(id)),
  ]);
  const onChain = chainRead.status === "found" ? chainRead.item : null;

  const { item } = view;
  // A recorded "confirmed" anchor that the chain does not know about is a
  // contradiction, and the page says so rather than showing both as facts.
  const contradicted = view.anchor?.status === "confirmed" && chainRead.status === "not_registered";
  const confirmedSpecs = view.specs.filter((s) => s.confirmedByOwner);
  const completed = history.filter((h) => h.transfer.state === "completed");

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <Callout tone="neutral" title="Public item passport">
        Anyone with this link or its QR code can see this page. It deliberately contains no email addresses, no
        exact collection address, no credentials and no private documents.
      </Callout>

      <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <ItemStatusBadge status={item.status} />
            <Badge tone="outline">{labelCategory(item.category)}</Badge>
            {item.isDemo ? <DemoBadge /> : <RealBadge />}
          </div>
          <SectionHeading
            level={1}
            title={item.title}
            description={
              <>
                Stable item ID <span className="lp-mono font-semibold">{item.id}</span> · offered by{" "}
                <strong>{view.orgName}</strong> · {item.locationRegion || "area not stated"}
              </>
            }
          />
          <p className="text-ink-soft">{item.description}</p>
        </div>

        <Card className="p-4 text-center">
          <img
            src={`/api/qr/${item.id}`}
            alt={`QR code linking to the public passport for item ${item.id}`}
            width={180}
            height={180}
            className="mx-auto h-44 w-44"
          />
          <p className="mt-2 lp-mono font-semibold">{item.id}</p>
          <p className="mt-1 text-xs text-ink-muted">Scan to open this passport</p>
        </Card>
      </div>

      {view.photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {view.photos
            .filter(() => true)
            .map((photo) => (
              <li key={photo.id}>
                <figure className="space-y-1">
                  <img
                    src={photo.url}
                    alt={photo.caption}
                    width={320}
                    height={240}
                    className="aspect-4/3 w-full rounded-card border border-line bg-paper-sunken object-cover"
                  />
                  <figcaption className="text-xs text-ink-muted">
                    {photo.caption}
                    <span className="mt-0.5 block lp-mono">sha256 {photo.sha256.slice(0, 16)}…</span>
                  </figcaption>
                </figure>
              </li>
            ))}
        </ul>
      ) : null}

      {/* ---------------------------------------------------- public evidence */}
      <Card className="p-5">
        <h2 className="text-lg">Public condition evidence</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Every statement is labelled with its basis. Only these confirmed items are covered by the anchored
          digest.
        </p>

        <dl className="mt-4 divide-y divide-line">
          <KeyValue label="Confirmed condition">{labelCondition(item.conditionGrade)}</KeyValue>
          <KeyValue label="Quantity">{item.quantity}</KeyValue>
          <KeyValue label="Brand / model">
            {item.brand === "unknown" && item.model === "unknown" ? "unknown" : `${item.brand} ${item.model}`.trim()}
          </KeyValue>
          <KeyValue label="Mass">
            {item.massKg != null ? (
              <>
                {item.massKg} kg per unit{" "}
                <Badge tone={item.massBasis === "measured" ? "mint" : "amber"} glyph={item.massBasis === "measured" ? "✓" : "≈"}>
                  {item.massBasis}
                </Badge>
              </>
            ) : (
              <Badge tone="outline" glyph="–">
                not recorded
              </Badge>
            )}
          </KeyValue>
          <KeyValue label="Known defects">{item.knownDefects || "none reported"}</KeyValue>
        </dl>

        {confirmedSpecs.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Confirmed specifications</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Specification
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Value
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    Basis
                  </th>
                </tr>
              </thead>
              <tbody>
                {confirmedSpecs.map((spec) => (
                  <tr key={spec.id} className="border-b border-line/60 align-top">
                    <th scope="row" className="py-2.5 pr-4 text-left font-medium">
                      {spec.label}
                    </th>
                    <td className="py-2.5 pr-4">{spec.value}</td>
                    <td className="py-2.5">
                      <EvidenceBadge source={spec.source} />
                      {spec.basis ? <p className="mt-1 text-xs text-ink-muted">{spec.basis}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {view.checklist ? (
          <div className="mt-5">
            <h3 className="text-base">Testing checklist</h3>
            <ChecklistTable checklist={view.checklist} />
          </div>
        ) : null}

        <div className="mt-5">
          <h3 className="text-base">Recorded statements</h3>
          <ol className="mt-3 space-y-3">
            {view.evidence.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-line bg-paper-sunken/40 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <EvidenceBadge source={entry.source} />
                  <span className="text-xs text-ink-muted">
                    {entry.recordedByOrgName ?? "unattributed"} · {entry.recordedAt.slice(0, 10)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-ink-soft">{entry.statement}</p>
              </li>
            ))}
            {view.evidence.length === 0 ? (
              <li className="text-sm text-ink-muted">No condition evidence recorded.</li>
            ) : null}
          </ol>
        </div>
      </Card>

      {/* ---------------------------------------------------- transfer history */}
      <Card className="p-5">
        <h2 className="text-lg">Transfer history</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {completed.length === 1
            ? "This item has completed one transfer."
            : completed.length > 1
              ? `This item has completed ${completed.length} transfers.`
              : "This item has not completed a transfer yet."}{" "}
          Requests that were never accepted are not shown.
        </p>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No transfer activity recorded.</p>
        ) : (
          <ul className="mt-4 space-y-5">
            {history.map((entry) => (
              <li key={entry.transfer.id} className="rounded-card border border-line p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <TransferStateBadge state={entry.transfer.state} />
                  <span className="lp-mono text-xs text-ink-muted">{entry.transfer.id}</span>
                </div>
                <p className="mt-2 text-sm">
                  <strong>{entry.donorOrgName}</strong> to <strong>{entry.recipientOrgName}</strong>
                </p>
                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  <AckRow
                    label="Donor recorded release"
                    done={entry.transfer.donorReleaseAck}
                    at={entry.transfer.releasedAt}
                  />
                  <AckRow
                    label="Recipient recorded receipt"
                    done={entry.transfer.recipientReceiptAck}
                    at={entry.transfer.receivedAt}
                  />
                </div>
                {entry.transfer.state === "disputed" ? (
                  <Callout tone="problem" title="Disputed">
                    {entry.transfer.disputeReason || "A problem was reported."} This transfer is excluded from
                    confirmed impact totals. The acknowledgments recorded before the dispute are still shown
                    above and still stand on chain.
                  </Callout>
                ) : null}
                <Disclosure summary="Timeline and blockchain record">
                  <TransferTimeline entries={entry.events} />
                  <div className="mt-4 space-y-2">
                    {entry.chainRows.length === 0 ? (
                      <p className="text-sm text-ink-muted">No anchoring attempts recorded for this transfer.</p>
                    ) : (
                      entry.chainRows.map((row) => (
                        <div
                          key={row.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-paper-sunken/40 px-3 py-2 text-sm"
                        >
                          <span className="font-medium">{row.action.replace(/_/g, " ")}</span>
                          <span className="flex flex-wrap items-center gap-2">
                            <ChainStatusBadge status={row.status} />
                            {row.txHash ? (
                              <Link href={`/chain/tx/${row.txHash}`} className="lp-mono">
                                {row.txHash.slice(0, 12)}…
                              </Link>
                            ) : null}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </Disclosure>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ------------------------------------------------------- anchor status */}
      <Card className="p-5">
        <h2 className="text-lg">Evidence anchoring</h2>
        {contradicted ? (
          <Callout tone="problem" title="LoopProof's record and the chain disagree">
            LoopProof recorded this anchor as confirmed, but the chain it is configured for
            has nothing registered under this item key. The usual cause is a development
            chain that was reset or redeployed after the anchor was written. Treat the
            status below as unverified: the anchor will be re-sent the next time this
            item&rsquo;s evidence is published.
          </Callout>
        ) : null}

        <dl className="mt-3 divide-y divide-line">
          <KeyValue label="LoopProof's recorded status">
            <ChainStatusBadge status={view.anchor?.status ?? "not_anchored"} />
            {contradicted ? (
              <Badge tone="clay" glyph="!">
                contradicted by the chain
              </Badge>
            ) : null}
          </KeyValue>
          <KeyValue label="Public manifest version">
            {view.manifest
              ? `v${view.manifest.versionNumber} (${view.manifest.manifestVersion}), written ${view.manifest.createdAt.slice(0, 10)}`
              : "no manifest snapshotted"}
          </KeyValue>
          <KeyValue label="Stored digest (SHA-256)">
            <span className="lp-mono">{view.manifest?.sha256 ?? "—"}</span>
          </KeyValue>
          <KeyValue label="On-chain state">
            {onChain ? (
              <>
                <Badge tone="forest" glyph="⛓">
                  {CHAIN_STATE_NAMES[onChain.state] ?? "Unknown"}
                </Badge>
                <span className="ml-2 text-xs text-ink-muted">
                  reservation #{onChain.reservationNonce}, registered{" "}
                  {new Date(onChain.registeredAt * 1000).toISOString().slice(0, 10)}
                </span>
              </>
            ) : chainRead.status === "unreachable" ? (
              <Badge tone="amber" glyph="!" title={chainRead.error}>
                could not reach the chain to check
              </Badge>
            ) : chainRead.status === "not_configured" ? (
              <Badge tone="outline" glyph="○">
                no contract configured in this environment
              </Badge>
            ) : (
              <Badge tone="outline" glyph="○">
                nothing registered for this item key
              </Badge>
            )}
          </KeyValue>
          <KeyValue label="Anchored digest">
            <span className="lp-mono">
              {onChain
                ? onChain.evidenceHash
                : chainRead.status === "unreachable"
                  ? "unknown — the chain could not be reached"
                  : "—"}
            </span>
          </KeyValue>
        </dl>

        {chainRead.status === "unreachable" ? (
          <Callout tone="warn" title="The blockchain could not be reached just now">
            <p>
              The status above is what LoopProof recorded when it last had a verified
              answer, not a fresh confirmation. Nothing here is being re-asserted as true
              while the chain is unreachable.
            </p>
            <p className="mt-1.5 lp-mono">{chainRead.error}</p>
          </Callout>
        ) : null}

        {view.anchor?.error ? (
          <Callout tone="warn" title="Anchoring note">
            {view.anchor.error}
          </Callout>
        ) : null}

        <Disclosure summary="Wallet addresses and contract detail">
          <dl className="divide-y divide-line">
            <KeyValue label="Item key (bytes32)">
              <span className="lp-mono">{itemIdToBytes32(item.id)}</span>
            </KeyValue>
            <KeyValue label="Contract address">
              <span className="lp-mono">{view.anchor?.contractAddress ?? "not configured"}</span>
            </KeyValue>
            <KeyValue label="Registering transaction">
              {view.anchor?.txHash ? (
                <Link href={`/chain/tx/${view.anchor.txHash}`} className="lp-mono">
                  {view.anchor.txHash}
                </Link>
              ) : (
                "none"
              )}
            </KeyValue>
            <KeyValue label="Owner wallet on chain">
              <span className="lp-mono">{onChain?.owner ?? "—"}</span>
            </KeyValue>
            <KeyValue label="Reserved-for wallet on chain">
              <span className="lp-mono">
                {onChain && onChain.recipient !== "0x0000000000000000000000000000000000000000"
                  ? onChain.recipient
                  : "none"}
              </span>
            </KeyValue>
          </dl>
          <Callout tone="warn" title="These are development wallets">
            On this local development chain the wallets are controlled by the demonstration environment. They do
            not prove that a particular organization signed anything, and LoopProof performs no independent
            identity verification.
          </Callout>
        </Disclosure>
      </Card>

      {/* --------------------------------------------------------- verification */}
      <EvidenceChecker itemId={item.id} />

      <Card className="p-5">
        <h2 className="text-lg">What the anchored digest covers</h2>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-forest-700">Covered by the digest</h3>
            <ul className="mt-2 space-y-1 text-sm text-ink-soft">
              {MANIFEST_COVERED_FIELDS.map((field) => (
                <li key={field} className="flex gap-2">
                  <span aria-hidden="true" className="text-forest-500">
                    ✓
                  </span>
                  <span className="lp-mono">{field}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-clay">Never in the manifest</h3>
            <ul className="mt-2 space-y-1 text-sm text-ink-soft">
              {MANIFEST_EXCLUDED_FIELDS.map((field) => (
                <li key={field} className="flex gap-2">
                  <span aria-hidden="true" className="text-clay">
                    ✕
                  </span>
                  <span>{field}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 text-sm text-ink-muted">
          Canonicalisation: UTF-8 JSON with object keys sorted lexicographically, array order preserved, no
          insignificant whitespace. SHA-256 over those bytes is anchored as <code className="lp-mono">bytes32</code>.
          Manifest version <code className="lp-mono">{view.manifest?.manifestVersion ?? "lp-manifest-1"}</code>.
        </p>
        <p className="mt-2 text-sm">
          <a href={`/api/items/${item.id}/manifest`}>Fetch the canonical manifest as JSON</a> and hash it yourself.
        </p>
      </Card>
    </div>
  );
}

function AckRow({ label, done, at }: { label: string; done: boolean; at: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper-sunken/40 px-3 py-2">
      <span className="text-sm">{label}</span>
      {done ? (
        <Badge tone="forest" glyph="✓">
          {at ? at.slice(0, 10) : "recorded"}
        </Badge>
      ) : (
        <Badge tone="outline" glyph="○">
          not recorded
        </Badge>
      )}
    </div>
  );
}
