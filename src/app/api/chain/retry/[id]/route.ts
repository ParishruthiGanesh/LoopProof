import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireSessionUser, requireAnyOrg } from "@/lib/auth";
import { anchor, settlePending } from "@/lib/chain";
import { errorResponse, ok } from "@/lib/api";

export const maxDuration = 60;

/**
 * Retries one anchoring attempt. Idempotent: the retry reuses the original
 * idempotency key, so a transaction that actually succeeded is never sent
 * twice, and a pending one is re-checked rather than re-sent.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSessionUser();
    const db = getDb();

    const rows = await db
      .select()
      .from(schema.chainTransactions)
      .where(eq(schema.chainTransactions.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return ok({ error: "No such anchoring attempt." }, 404);

    // Only the two organizations party to the record may retry it.
    const parties: string[] = [];
    if (row.transferId) {
      const transfer = (
        await db.select().from(schema.transfers).where(eq(schema.transfers.id, row.transferId)).limit(1)
      )[0];
      if (transfer) parties.push(transfer.donorOrgId, transfer.recipientOrgId);
    } else if (row.itemId) {
      const item = (await db.select().from(schema.items).where(eq(schema.items.id, row.itemId)).limit(1))[0];
      if (item) parties.push(item.orgId);
    }
    requireAnyOrg(user, parties, "Only the organizations party to this record can retry anchoring it.");

    if (row.status === "confirmed" || row.status === "simulated") {
      return ok({ ok: true, status: row.status, txHash: row.txHash, deduplicated: true });
    }
    if (row.status === "pending" && row.txHash) {
      const settled = await settlePending(row.id);
      return ok({ ok: true, ...settled, deduplicated: true });
    }

    const payload = JSON.parse(row.payload || "{}") as Record<string, unknown>;
    const result = await anchor({
      action: row.action,
      idempotencyKey: row.idempotencyKey,
      itemId: row.itemId ?? "",
      itemKey: (payload.itemKey as `0x${string}`) ?? `0x${"0".repeat(64)}`,
      transferId: row.transferId,
      actingOrgId: user.orgId,
      args: (payload.args as readonly unknown[]) ?? [],
      payload,
    });

    return ok({
      ok: result.status === "confirmed" || result.status === "simulated",
      status: result.status,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      error: result.error,
      note:
        "Retrying reuses the original idempotency key, so a transaction that already succeeded is never sent a second time.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
