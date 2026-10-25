import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { loadTransferView } from "@/lib/transfers";
import { loadItemView } from "@/lib/items";
import {
  Card,
  SectionHeading,
  Badge,
  Callout,
  KeyValue,
  TransferStateBadge,
  ChainStatusBadge,
  Disclosure,
  DemoBadge,
  RealBadge,
} from "@/components/ui";
import { TransferActions } from "@/components/transfer-actions";
import { TransferTimeline } from "@/components/transfer-timeline";
import { RetryAnchor } from "@/components/retry-anchor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Transfer ${id}` };
}

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  const view = await loadTransferView(id, user?.orgId ?? null);
  if (!view) notFound();

  const { transfer } = view;
  const itemView = await loadItemView(transfer.itemId);
  const db = getDb();
  const linkedRequest = transfer.requestId
    ? (await db.select().from(schema.requests).where(eq(schema.requests.id, transfer.requestId)).limit(1))[0]
    : null;

  const isParty = view.role !== "public";

  return (
    <div className="space-y-7">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <Link href="/transfers">Transfers</Link> <span aria-hidden="true">/</span>{" "}
        <span className="lp-mono">{transfer.id}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-1.5">
        <TransferStateBadge state={transfer.state} />
        {isParty ? (
          <Badge tone="outline" glyph={view.role === "donor" ? "↑" : "↓"}>
            You are the {view.role}
          </Badge>
        ) : (
          <Badge tone="outline" glyph="○">
            Viewing as a non-party
          </Badge>
        )}
        {transfer.isDemo ? <DemoBadge /> : <RealBadge />}
      </div>

      <SectionHeading
        level={1}
        title={view.itemTitle}
        description={
          <>
            <strong>{view.donorOrgName}</strong> to <strong>{view.recipientOrgName}</strong> · item{" "}
            <Link href={`/marketplace/${transfer.itemId}`} className="lp-mono">
              {transfer.itemId}
            </Link>
          </>
        }
      />

      {transfer.requiresReacknowledgement ? (
        <Callout tone="warn" title="The item's public evidence changed after this reservation">
          The recipient agreed to evidence version {transfer.evidenceVersionAtReservation}, and the listing is now
          at version {itemView?.item.evidenceVersion}. The recipient must review the revised evidence and confirm
          it before receipt can be recorded. The earlier acknowledgment is not silently carried over.
        </Callout>
      ) : null}

      {transfer.state === "disputed" ? (
        <Callout tone="problem" title="This transfer is disputed">
          <p>{transfer.disputeReason || "A problem was reported."}</p>
          <p className="mt-2">
            It is excluded from confirmed impact totals. The acknowledgments recorded before the dispute remain in
            the timeline and on chain; nothing was erased.
          </p>
        </Callout>
      ) : null}

      {transfer.state === "cancelled" ? (
        <Callout tone="neutral" title="This transfer was cancelled">
          {transfer.cancelReason || "No reason was recorded."} The item returned to the marketplace and can be
          reserved again.
        </Callout>
      ) : null}

      <div className="grid gap-7 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-base">Shared timeline</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Both parties see exactly this. Each entry records who acted and when.
            </p>
            <TransferTimeline entries={view.timeline} />
          </Card>

          <Card className="p-5">
            <h2 className="text-base">Acknowledgments</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Completion requires both. Neither party can complete a transfer alone.
            </p>
            <ul className="mt-3 space-y-2">
              <li className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper-sunken/40 px-3.5 py-2.5">
                <span className="text-sm">
                  <strong>Donor released the item</strong>
                  <span className="block text-xs text-ink-muted">{view.donorOrgName}</span>
                </span>
                {transfer.donorReleaseAck ? (
                  <Badge tone="forest" glyph="✓">
                    Recorded {transfer.releasedAt?.slice(0, 10)}
                  </Badge>
                ) : (
                  <Badge tone="outline" glyph="○">
                    Not recorded
                  </Badge>
                )}
              </li>
              <li className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper-sunken/40 px-3.5 py-2.5">
                <span className="text-sm">
                  <strong>Recipient received the item</strong>
                  <span className="block text-xs text-ink-muted">{view.recipientOrgName}</span>
                </span>
                {transfer.recipientReceiptAck ? (
                  <Badge tone="forest" glyph="✓">
                    Recorded {transfer.receivedAt?.slice(0, 10)}
                  </Badge>
                ) : (
                  <Badge tone="outline" glyph="○">
                    Not recorded
                  </Badge>
                )}
              </li>
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="text-base">Blockchain record</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Each state change is sent to the shared contract. A failed transaction is shown as failed and can be
              retried; nothing is marked confirmed before a receipt says so.
            </p>
            {view.chainRows.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">
                No anchoring attempts yet. Requests and declines are deliberately not anchored, because nothing has
                been agreed.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {view.chainRows.map((row) => (
                  <li key={row.id} className="rounded-lg border border-line bg-paper-sunken/40 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{row.action.replace(/_/g, " ")}</span>
                      <ChainStatusBadge status={row.status} />
                    </div>
                    {row.errorMessage ? <p className="mt-1.5 text-sm text-clay">{row.errorMessage}</p> : null}
                    <Disclosure summary="Transaction detail">
                      <dl className="divide-y divide-line">
                        <KeyValue label="Transaction hash">
                          {row.txHash ? (
                            <Link href={`/chain/tx/${row.txHash}`} className="lp-mono">
                              {row.txHash}
                            </Link>
                          ) : (
                            <span className="text-ink-muted">none sent</span>
                          )}
                        </KeyValue>
                        <KeyValue label="Block">{row.blockNumber ?? "—"}</KeyValue>
                        <KeyValue label="Chain">
                          {row.chainId ? `chainId ${row.chainId}` : "not configured"}
                        </KeyValue>
                        <KeyValue label="Contract">
                          <span className="lp-mono">{row.contractAddress ?? "not configured"}</span>
                        </KeyValue>
                        <KeyValue label="Signed by (development wallet)">
                          <span className="lp-mono">{row.fromAddress ?? "—"}</span>
                        </KeyValue>
                        <KeyValue label="Attempts">{row.attempts}</KeyValue>
                      </dl>
                      {isParty && (row.status === "failed" || row.status === "pending") ? (
                        <div className="mt-3">
                          <RetryAnchor id={row.id} />
                        </div>
                      ) : null}
                    </Disclosure>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {isParty ? (
            <Card className="p-5">
              <h2 className="text-base">Your next step</h2>
              <TransferActions
                transferId={transfer.id}
                state={transfer.state}
                role={view.role as "donor" | "recipient"}
                actions={view.actions}
                requiresReacknowledgement={transfer.requiresReacknowledgement}
              />
            </Card>
          ) : (
            <Callout tone="neutral" title="You are not a party to this transfer">
              Only the donor and the recipient can act on it. The timeline above is the public record; the
              recipient&rsquo;s request message and the collection address are not shown to you.
            </Callout>
          )}

          <Card className="p-5">
            <h2 className="text-base">Details</h2>
            <dl className="mt-2 divide-y divide-line">
              <KeyValue label="Transfer ID">
                <span className="lp-mono">{transfer.id}</span>
              </KeyValue>
              <KeyValue label="Quantity">{transfer.quantity}</KeyValue>
              <KeyValue label="Opened">{transfer.createdAt.slice(0, 16).replace("T", " ")}</KeyValue>
              <KeyValue label="Reserved">
                {transfer.reservedAt ? transfer.reservedAt.slice(0, 16).replace("T", " ") : "—"}
              </KeyValue>
              <KeyValue label="Completed">
                {transfer.completedAt ? transfer.completedAt.slice(0, 16).replace("T", " ") : "—"}
              </KeyValue>
              <KeyValue label="Evidence version agreed">
                {transfer.evidenceVersionAtReservation ?? "not yet reserved"}
              </KeyValue>
            </dl>

            {isParty ? (
              <Callout tone="info" title="Request message (both parties only)">
                {transfer.requestMessage || "No message was supplied."}
              </Callout>
            ) : null}

            {isParty && view.role === "recipient" && ["reserved", "released"].includes(transfer.state) ? (
              <Callout tone="info" title="Collection address, released to you">
                <p className="lp-mono">{itemView?.item.collectionAddress || "no address recorded"}</p>
              </Callout>
            ) : null}

            {linkedRequest ? (
              <p className="mt-3 text-sm">
                Linked to request{" "}
                <Link href={`/requests/${linkedRequest.id}`} className="lp-mono">
                  {linkedRequest.id}
                </Link>
                .
              </p>
            ) : null}
          </Card>

          <Card className="p-5">
            <h2 className="text-base">Item evidence</h2>
            <dl className="mt-2 divide-y divide-line">
              <KeyValue label="Public manifest">
                {itemView?.manifest ? `v${itemView.manifest.versionNumber}` : "not snapshotted"}
              </KeyValue>
              <KeyValue label="Anchor">
                <ChainStatusBadge status={itemView?.anchor?.status ?? "not_anchored"} />
              </KeyValue>
            </dl>
            <p className="mt-3 text-sm">
              <Link href={`/passport/${transfer.itemId}`}>Open the public passport &rarr;</Link>
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

