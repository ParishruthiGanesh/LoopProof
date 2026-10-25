import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireSessionUser, requireOrg } from "@/lib/auth";
import { publishItem, flagTransfersForReacknowledgement } from "@/lib/items";
import { errorResponse, ok } from "@/lib/api";

/**
 * Re-snapshots and re-anchors a listing's public evidence. If the digest moved
 * while a reservation was open, the open transfer is flagged so the recipient
 * must acknowledge the revised evidence before completion.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSessionUser();
    const db = getDb();
    const rows = await db.select().from(schema.items).where(eq(schema.items.id, id)).limit(1);
    const item = rows[0];
    if (!item) return ok({ error: "No such listing." }, 404);

    requireOrg(user, item.orgId, "Only the listing's own organization can publish it.");

    const result = await publishItem(id, user.orgId);
    const flagged = result.snapshot.changed
      ? await flagTransfersForReacknowledgement(id, result.snapshot.versionNumber)
      : 0;

    return ok({
      ok: true,
      evidenceVersion: result.snapshot.versionNumber,
      evidenceSha256: result.snapshot.sha256,
      evidenceChanged: result.snapshot.changed,
      transfersFlaggedForReacknowledgement: flagged,
      anchorStatus: result.anchorResult.status,
      anchorError: result.anchorResult.error,
      txHash: result.anchorResult.txHash,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
