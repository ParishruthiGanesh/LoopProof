import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { runMatching } from "@/lib/matching";
import { errorResponse, ok } from "@/lib/api";

export const maxDuration = 60;

/** Recomputes matches. Available to any signed-in organization, since donors
 *  need to see which of their items a request could satisfy. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getSessionUser();
    if (!user) return ok({ error: "Sign in to recompute matches." }, 401);

    const db = getDb();
    const rows = await db.select().from(schema.requests).where(eq(schema.requests.id, id)).limit(1);
    if (!rows[0]) return ok({ error: "No such request." }, 404);

    const result = await runMatching(id);
    return ok({
      ok: true,
      method: result.method,
      semanticNote: result.semanticNote,
      semanticUnavailableReason: result.semanticUnavailableReason,
      eligibleCount: result.eligible.length,
      ineligibleCount: result.ineligible.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
