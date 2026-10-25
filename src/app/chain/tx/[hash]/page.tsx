import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { publicClient, rpcHealth } from "@/lib/chain";
import type { TransactionReceipt } from "viem";
import { Card, SectionHeading, KeyValue, Callout, ChainStatusBadge, Badge } from "@/components/ui";

export const metadata = { title: "Transaction detail" };

/**
 * A local transaction detail view. The local development chain has no public
 * explorer, so this reads the receipt straight from the node.
 */
export default async function TxPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.chainTransactions)
    .where(eq(schema.chainTransactions.txHash, hash))
    .limit(1);
  const row = rows[0] ?? null;

  const events = row
    ? await db.select().from(schema.chainEvents).where(eq(schema.chainEvents.chainTransactionId, row.id))
    : [];

  const health = await rpcHealth();
  let receipt: TransactionReceipt | null = null;
  let receiptError: string | null = null;
  if (health.reachable && /^0x[0-9a-fA-F]{64}$/.test(hash)) {
    try {
      receipt = await publicClient().getTransactionReceipt({ hash: hash as `0x${string}` });
    } catch (error) {
      receiptError = error instanceof Error ? error.message.split("\n")[0] : String(error);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionHeading
        level={1}
        title="Transaction detail"
        description="Read directly from the local development node. There is no public explorer for a local chain, so this view stands in for one."
      />

      <Card className="p-5">
        <dl className="divide-y divide-line">
          <KeyValue label="Transaction hash">
            <span className="lp-mono">{hash}</span>
          </KeyValue>
          <KeyValue label="LoopProof status">
            <ChainStatusBadge status={row?.status ?? "not_anchored"} />
          </KeyValue>
          <KeyValue label="Action">{row ? row.action.replace(/_/g, " ") : "not recorded by LoopProof"}</KeyValue>
          <KeyValue label="Item">
            {row?.itemId ? (
              <Link href={`/passport/${row.itemId}`} className="lp-mono">
                {row.itemId}
              </Link>
            ) : (
              "—"
            )}
          </KeyValue>
          <KeyValue label="Transfer">
            {row?.transferId ? (
              <Link href={`/transfers/${row.transferId}`} className="lp-mono">
                {row.transferId}
              </Link>
            ) : (
              "—"
            )}
          </KeyValue>
          <KeyValue label="Signed by (development wallet)">
            <span className="lp-mono">{row?.fromAddress ?? "—"}</span>
          </KeyValue>
          <KeyValue label="Attempts">{row?.attempts ?? 0}</KeyValue>
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="text-base">On-chain receipt</h2>
        {!health.reachable ? (
          <Callout tone="warn" title="The development chain is not reachable">
            LoopProof cannot read the receipt right now. Its own recorded status above is unchanged, and remains
            whatever the last verified result was. Start the chain with <code className="lp-mono">npm run chain:node</code>.
          </Callout>
        ) : receiptError ? (
          <Callout tone="warn" title="No receipt found for this hash">
            {receiptError}
          </Callout>
        ) : receipt ? (
          <dl className="mt-2 divide-y divide-line">
            <KeyValue label="Receipt status">
              <Badge tone={receipt.status === "success" ? "forest" : "clay"} glyph={receipt.status === "success" ? "✓" : "✕"}>
                {receipt.status}
              </Badge>
            </KeyValue>
            <KeyValue label="Block number">{receipt.blockNumber.toString()}</KeyValue>
            <KeyValue label="Block hash">
              <span className="lp-mono">{receipt.blockHash}</span>
            </KeyValue>
            <KeyValue label="From">
              <span className="lp-mono">{receipt.from}</span>
            </KeyValue>
            <KeyValue label="To (contract)">
              <span className="lp-mono">{receipt.to ?? "—"}</span>
            </KeyValue>
            <KeyValue label="Gas used">{receipt.gasUsed.toString()}</KeyValue>
            <KeyValue label="Logs emitted">{receipt.logs.length}</KeyValue>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">That hash is not a valid 32-byte transaction hash.</p>
        )}
      </Card>

      {events.length > 0 ? (
        <Card className="p-5">
          <h2 className="text-base">Decoded contract events</h2>
          <ul className="mt-3 space-y-3">
            {events.map((event) => (
              <li key={event.id} className="rounded-lg border border-line bg-paper-sunken/40 p-3.5">
                <p className="font-semibold">{event.eventName}</p>
                <pre className="mt-1.5 overflow-x-auto lp-mono text-ink-soft">{formatArgs(event.argsJson)}</pre>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Callout tone="neutral" title="What a confirmed transaction does and does not mean">
        A confirmed receipt proves that these organizations&rsquo; development wallets signed these
        acknowledgments, and that the anchored evidence digest has not changed since. It does not prove that the
        item works, that a physical handoff happened, or that the wallets belong to the organizations they are
        labelled with. On this local chain the wallets are controlled by the demo environment.
      </Callout>
    </div>
  );
}

function formatArgs(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}
