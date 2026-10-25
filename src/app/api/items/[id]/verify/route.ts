import { verifyEvidence } from "@/lib/items";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { errorResponse, ok } from "@/lib/api";

/**
 * Recomputes the public evidence digest from current data and compares it with
 * the stored manifest and the on-chain anchor. Public: it reveals nothing
 * beyond what the passport already shows.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const rows = await db.select({ id: schema.items.id }).from(schema.items).where(eq(schema.items.id, id)).limit(1);
    if (!rows[0]) return ok({ error: "No such item." }, 404);

    const result = await verifyEvidence(id);
    return ok({
      ok: true,
      ...result,
      interpretation: describe(result.localMatch, result.anchorMatch, result.anchorReadStatus),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function describe(
  localMatch: boolean,
  anchorMatch: boolean | null,
  anchorReadStatus: "found" | "not_registered" | "not_configured" | "unreachable",
): string {
  if (!localMatch) {
    return "The public evidence now on this page does not hash to the manifest LoopProof stored. Something changed after the manifest was written.";
  }
  if (anchorMatch === null) {
    // Being unable to reach the chain is not the same as nothing being
    // anchored, and must never be reported as though it were.
    switch (anchorReadStatus) {
      case "unreachable":
        return "The page matches the stored manifest. The blockchain could not be reached, so the anchored digest could not be read and this check is incomplete — it is not a pass.";
      case "not_configured":
        return "The page matches the stored manifest. No contract is configured in this environment, so there is no anchor to compare against.";
      default:
        return "The page matches the stored manifest. Nothing is anchored on chain for this item, so there is no independent anchor to compare against yet.";
    }
  }
  if (anchorMatch) {
    return "The public evidence on this page hashes to exactly the digest anchored on the local development chain.";
  }
  return "The page matches LoopProof's stored manifest, but that digest differs from the one anchored on chain. The anchored evidence and the current evidence are not the same.";
}
