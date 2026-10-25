import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { canonicalize, sha256Hex, itemIdToBytes32 } from "@/lib/evidence-manifest";
import { readOnChainItemResult } from "@/lib/chain";
import { errorResponse, ok, parseJson } from "@/lib/api";

const bodySchema = z.object({
  /** A manifest document to check, as text. Usually a copy of the real one
   *  with one field edited, to demonstrate tamper detection. */
  candidateJson: z.string().min(2).max(200_000),
  /** When true, the text is re-canonicalised before hashing, so cosmetic
   *  whitespace differences do not count as tampering. */
  canonicalizeFirst: z.boolean().default(true),
});

/**
 * Hashes a supplied candidate manifest and compares it with what is anchored
 * on chain. This is the "change a copy of the evidence and watch it fail"
 * check: nothing is written, and the item's real evidence is untouched.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const item = (await db.select().from(schema.items).where(eq(schema.items.id, id)).limit(1))[0];
    if (!item) return ok({ error: "No such item." }, 404);

    const body = await parseJson(request, bodySchema);

    let canonical = body.candidateJson;
    let parseWarning: string | null = null;
    if (body.canonicalizeFirst) {
      try {
        canonical = canonicalize(JSON.parse(body.candidateJson));
      } catch {
        parseWarning =
          "That text is not valid JSON, so it was hashed exactly as supplied rather than canonicalised.";
        canonical = body.candidateJson;
      }
    }

    const candidateSha256 = sha256Hex(canonical);
    const read = await readOnChainItemResult(itemIdToBytes32(id));
    const anchoredSha256 = read.status === "found" ? read.item.evidenceHash.replace(/^0x/, "") : null;

    const storedRows = await db
      .select({ sha256: schema.evidenceManifests.sha256, versionNumber: schema.evidenceManifests.versionNumber })
      .from(schema.evidenceManifests)
      .where(eq(schema.evidenceManifests.itemId, id));
    const knownVersion = storedRows.find((r) => r.sha256 === candidateSha256) ?? null;

    return ok({
      ok: true,
      candidateSha256,
      anchoredSha256,
      matchesAnchor: anchoredSha256 ? anchoredSha256 === candidateSha256 : null,
      matchesAKnownVersion: knownVersion ? knownVersion.versionNumber : null,
      parseWarning,
      anchorReadStatus: read.status,
      interpretation: anchoredSha256
        ? anchoredSha256 === candidateSha256
          ? "This document hashes to exactly the digest anchored on chain. It is the evidence the parties acknowledged."
          : "This document does NOT hash to the digest anchored on chain. It has been altered, or it is a different version. The anchor is unchanged; the document is what failed."
        : read.status === "unreachable"
          ? "The blockchain could not be reached, so this document could not be compared with any anchor. That is an incomplete check, not a pass."
          : "Nothing is anchored on chain for this item yet, so there is no anchor to compare this document against.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
