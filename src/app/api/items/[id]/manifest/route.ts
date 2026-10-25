import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { buildManifest } from "@/lib/items";
import { MANIFEST_COVERED_FIELDS, MANIFEST_EXCLUDED_FIELDS, manifestDigest } from "@/lib/evidence-manifest";
import { errorResponse, ok } from "@/lib/api";

/**
 * The canonical public evidence manifest, byte-for-byte as it is hashed.
 * Anyone can fetch this, recompute SHA-256 over it, and compare the result
 * with the on-chain anchor without trusting LoopProof's own answer.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const item = (await db.select().from(schema.items).where(eq(schema.items.id, id)).limit(1))[0];
    if (!item) return ok({ error: "No such item." }, 404);

    const manifest = await buildManifest(id);
    const current = manifestDigest(manifest);

    const versions = await db
      .select({
        versionNumber: schema.evidenceManifests.versionNumber,
        sha256: schema.evidenceManifests.sha256,
        createdAt: schema.evidenceManifests.createdAt,
        manifestVersion: schema.evidenceManifests.manifestVersion,
      })
      .from(schema.evidenceManifests)
      .where(eq(schema.evidenceManifests.itemId, id))
      .orderBy(desc(schema.evidenceManifests.versionNumber));

    return ok({
      itemId: id,
      manifestVersion: manifest.manifestVersion,
      canonicalJson: current.canonicalJson,
      sha256: current.sha256,
      bytes32: current.bytes32,
      coveredFields: MANIFEST_COVERED_FIELDS,
      excludedFields: MANIFEST_EXCLUDED_FIELDS,
      canonicalizationRules:
        "UTF-8 JSON with object keys sorted lexicographically, array order preserved, no insignificant whitespace. SHA-256 over those bytes; the result is anchored as bytes32.",
      versionHistory: versions,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
