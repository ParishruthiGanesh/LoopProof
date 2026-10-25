import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import { uuid } from "./ids";
import {
  MANIFEST_VERSION,
  manifestDigest,
  itemIdToBytes32,
  type EvidenceManifest,
  type VerificationResult,
} from "./evidence-manifest";
import { anchor, readOnChainItem, readOnChainItemResult, type ChainStatus } from "./chain";
import { photoUrl } from "./uploads";

export type ItemRecord = typeof schema.items.$inferSelect;

export type PublicPhoto = { id: string; url: string; caption: string; sha256: string };

export type PublicSpec = {
  id: string;
  label: string;
  value: string;
  source: string;
  basis: string;
  confirmedByOwner: boolean;
};

export type PublicEvidence = {
  id: string;
  kind: string;
  source: string;
  statement: string;
  recordedByOrgName: string | null;
  recordedAt: string;
};

export type ItemView = {
  item: ItemRecord;
  orgName: string;
  orgLocationRegion: string;
  photos: PublicPhoto[];
  specs: PublicSpec[];
  evidence: PublicEvidence[];
  checklist: typeof schema.testChecklists.$inferSelect | null;
  anchor: {
    status: ChainStatus;
    txHash: string | null;
    blockNumber: number | null;
    contractAddress: string | null;
    chainId: number | null;
    error: string | null;
    itemKey: string;
  } | null;
  manifest: {
    versionNumber: number;
    manifestVersion: string;
    sha256: string;
    createdAt: string;
  } | null;
};

/* ------------------------------------------------------ evidence manifests */

/** Builds the canonical public manifest from current database state. */
export async function buildManifest(itemId: string): Promise<EvidenceManifest> {
  const db = getDb();
  const itemRows = await db.select().from(schema.items).where(eq(schema.items.id, itemId)).limit(1);
  const item = itemRows[0];
  if (!item) throw new Error(`Unknown item ${itemId}`);

  const specs = await db
    .select()
    .from(schema.itemSpecs)
    .where(and(eq(schema.itemSpecs.itemId, itemId), eq(schema.itemSpecs.confirmedByOwner, true)))
    .orderBy(asc(schema.itemSpecs.sortOrder), asc(schema.itemSpecs.label));

  const evidence = await db
    .select()
    .from(schema.conditionEvidence)
    .where(and(eq(schema.conditionEvidence.itemId, itemId), eq(schema.conditionEvidence.isPublic, true)))
    .orderBy(asc(schema.conditionEvidence.recordedAt), asc(schema.conditionEvidence.id));

  const photos = await db
    .select()
    .from(schema.itemPhotos)
    .where(and(eq(schema.itemPhotos.itemId, itemId), eq(schema.itemPhotos.isPublic, true)))
    .orderBy(asc(schema.itemPhotos.sortOrder), asc(schema.itemPhotos.id));

  const checklistRows = await db
    .select()
    .from(schema.testChecklists)
    .where(eq(schema.testChecklists.itemId, itemId))
    .limit(1);
  const checklist = checklistRows[0];

  return {
    manifestVersion: MANIFEST_VERSION,
    itemId: item.id,
    title: item.title,
    category: item.category,
    description: item.description,
    brand: item.brand,
    model: item.model,
    conditionGrade: item.conditionGrade,
    quantity: item.quantity,
    massKg: item.massKg ?? null,
    massBasis: item.massBasis,
    locationRegion: item.locationRegion,
    knownDefects: item.knownDefects,
    specifications: specs.map((s) => ({ label: s.label, value: s.value, source: s.source })),
    testChecklist: checklist
      ? {
          powersOn: checklist.powersOn,
          displayWorks: checklist.displayWorks,
          portsTested: checklist.portsTested,
          cablesIncluded: checklist.cablesIncluded,
          notes: checklist.notes,
        }
      : null,
    conditionEvidence: evidence.map((e) => ({
      kind: e.kind,
      source: e.source,
      statement: e.statement,
      recordedAt: e.recordedAt,
    })),
    photos: photos.map((p) => ({ sha256: p.sha256, caption: p.caption })),
  };
}

/**
 * Snapshots the current public evidence as a new manifest version. Previous
 * versions are kept, so evidence history is preserved when a listing changes.
 */
export async function snapshotManifest(itemId: string): Promise<{
  versionNumber: number;
  sha256: string;
  bytes32: `0x${string}`;
  changed: boolean;
}> {
  const db = getDb();
  const manifest = await buildManifest(itemId);
  const { canonicalJson, sha256, bytes32 } = manifestDigest(manifest);

  const existing = await db
    .select()
    .from(schema.evidenceManifests)
    .where(eq(schema.evidenceManifests.itemId, itemId))
    .orderBy(desc(schema.evidenceManifests.versionNumber));

  const latest = existing[0];
  if (latest && latest.sha256 === sha256) {
    return { versionNumber: latest.versionNumber, sha256, bytes32, changed: false };
  }

  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  await db.insert(schema.evidenceManifests).values({
    id: uuid(),
    itemId,
    versionNumber,
    manifestVersion: MANIFEST_VERSION,
    canonicalJson,
    sha256,
  });
  await db
    .update(schema.items)
    .set({ evidenceVersion: versionNumber, updatedAt: new Date().toISOString() })
    .where(eq(schema.items.id, itemId));

  return { versionNumber, sha256, bytes32, changed: true };
}

/**
 * Publishes a listing: snapshots evidence, then anchors the digest on the
 * local development chain. Publication is not blocked by chain problems; the
 * anchor row records the real status instead.
 */
export async function publishItem(itemId: string, actingOrgId: string) {
  const db = getDb();
  const snapshot = await snapshotManifest(itemId);

  // Publishing promotes a draft. It must never drag a reserved or already
  // transferred item back into the marketplace.
  await db
    .update(schema.items)
    .set({ status: "available", updatedAt: new Date().toISOString() })
    .where(and(eq(schema.items.id, itemId), eq(schema.items.status, "draft")));

  const itemKey = itemIdToBytes32(itemId);
  const onChain = await readOnChainItem(itemKey);

  // Already anchored with exactly this digest: there is nothing to send.
  if (onChain && onChain.evidenceHash.toLowerCase() === snapshot.bytes32.toLowerCase()) {
    const existing = await db
      .select()
      .from(schema.chainTransactions)
      .where(
        and(
          eq(schema.chainTransactions.itemId, itemId),
          inArray(schema.chainTransactions.action, ["register_item", "update_evidence"]),
          eq(schema.chainTransactions.status, "confirmed"),
        ),
      )
      .orderBy(desc(schema.chainTransactions.createdAt))
      .limit(1);
    return {
      snapshot,
      anchorResult: {
        chainTransactionId: existing[0]?.id ?? "",
        status: "confirmed" as const,
        txHash: existing[0]?.txHash ?? null,
        blockNumber: existing[0]?.blockNumber ?? null,
        error: null,
        deduplicated: true,
      },
    };
  }

  // Evidence changed while a transfer is in progress. The contract refuses to
  // move the anchor underneath an acknowledgment, which is the intended
  // behaviour: say so plainly rather than reporting a bare failure.
  if (onChain && onChain.state !== 1) {
    return {
      snapshot,
      anchorResult: {
        chainTransactionId: "",
        status: "not_anchored" as const,
        txHash: null,
        blockNumber: null,
        error: `This item is in on-chain state "${onChain.stateName}", so its evidence anchor cannot be moved. Evidence version ${snapshot.versionNumber} is recorded off-chain and the open transfer has been flagged for re-acknowledgment; the anchor can be updated once the transfer is closed.`,
        deduplicated: false,
      },
    };
  }

  const result = onChain
    ? await anchor({
        action: "update_evidence",
        idempotencyKey: `update_evidence:${itemId}:v${snapshot.versionNumber}`,
        itemId,
        itemKey,
        actingOrgId,
        args: [itemKey, snapshot.bytes32, MANIFEST_VERSION],
        payload: { versionNumber: snapshot.versionNumber, sha256: snapshot.sha256 },
      })
    : await anchor({
        action: "register_item",
        idempotencyKey: `register_item:${itemId}`,
        itemId,
        itemKey,
        actingOrgId,
        args: [itemKey, snapshot.bytes32, MANIFEST_VERSION],
        payload: { versionNumber: snapshot.versionNumber, sha256: snapshot.sha256 },
      });

  return { snapshot, anchorResult: result };
}

/**
 * Called whenever public evidence changes on an item that has an open
 * reservation. The transfer is flagged so the recipient must acknowledge the
 * changed evidence again before the handoff proceeds.
 */
export async function flagTransfersForReacknowledgement(itemId: string, newVersion: number) {
  const db = getDb();
  const open = await db
    .select()
    .from(schema.transfers)
    .where(and(eq(schema.transfers.itemId, itemId), inArray(schema.transfers.state, ["reserved", "released"])));

  for (const transfer of open) {
    if (transfer.evidenceVersionAtReservation === newVersion) continue;
    await db
      .update(schema.transfers)
      .set({ requiresReacknowledgement: true, updatedAt: new Date().toISOString() })
      .where(eq(schema.transfers.id, transfer.id));
    await db.insert(schema.transferEvents).values({
      id: uuid(),
      transferId: transfer.id,
      kind: "evidence_changed",
      fromState: transfer.state,
      toState: transfer.state,
      note: `Public evidence changed to version ${newVersion}. The recipient must acknowledge the revised evidence before this transfer can be completed.`,
      isPublic: true,
    });
  }
  return open.length;
}

/* -------------------------------------------------------- verification */

/**
 * Recomputes the digest from current public evidence and compares it with the
 * stored manifest and the on-chain anchor. This is what the passport's
 * "check evidence" control calls.
 */
export async function verifyEvidence(itemId: string): Promise<VerificationResult> {
  const db = getDb();
  const stored = (
    await db
      .select()
      .from(schema.evidenceManifests)
      .where(eq(schema.evidenceManifests.itemId, itemId))
      .orderBy(desc(schema.evidenceManifests.versionNumber))
      .limit(1)
  )[0];

  const manifest = await buildManifest(itemId);
  const { sha256: recomputed } = manifestDigest(manifest);

  const read = await readOnChainItemResult(itemIdToBytes32(itemId));
  const anchoredSha256 = read.status === "found" ? read.item.evidenceHash.replace(/^0x/, "") : null;

  return {
    storedSha256: stored?.sha256 ?? "",
    recomputedSha256: recomputed,
    localMatch: Boolean(stored) && stored!.sha256 === recomputed,
    anchoredSha256,
    anchorMatch: anchoredSha256 ? anchoredSha256 === recomputed : null,
    manifestVersion: stored?.manifestVersion ?? MANIFEST_VERSION,
    anchorReadStatus: read.status,
    anchorReadError: read.status === "unreachable" ? read.error : null,
  };
}

/* ----------------------------------------------------------------- views */

export async function loadItemView(itemId: string): Promise<ItemView | null> {
  const db = getDb();
  const rows = await db
    .select({
      item: schema.items,
      orgName: schema.organizations.name,
      orgLocationRegion: schema.organizations.locationRegion,
    })
    .from(schema.items)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.items.orgId))
    .where(eq(schema.items.id, itemId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const photos = await db
    .select()
    .from(schema.itemPhotos)
    .where(eq(schema.itemPhotos.itemId, itemId))
    .orderBy(asc(schema.itemPhotos.sortOrder));

  const specs = await db
    .select()
    .from(schema.itemSpecs)
    .where(eq(schema.itemSpecs.itemId, itemId))
    .orderBy(asc(schema.itemSpecs.sortOrder), asc(schema.itemSpecs.label));

  const evidenceRows = await db
    .select({ e: schema.conditionEvidence, orgName: schema.organizations.name })
    .from(schema.conditionEvidence)
    .leftJoin(schema.organizations, eq(schema.organizations.id, schema.conditionEvidence.recordedByOrgId))
    .where(eq(schema.conditionEvidence.itemId, itemId))
    .orderBy(asc(schema.conditionEvidence.recordedAt));

  const checklist =
    (
      await db
        .select()
        .from(schema.testChecklists)
        .where(eq(schema.testChecklists.itemId, itemId))
        .limit(1)
    )[0] ?? null;

  const manifest =
    (
      await db
        .select()
        .from(schema.evidenceManifests)
        .where(eq(schema.evidenceManifests.itemId, itemId))
        .orderBy(desc(schema.evidenceManifests.versionNumber))
        .limit(1)
    )[0] ?? null;

  const anchorRow =
    (
      await db
        .select()
        .from(schema.chainTransactions)
        .where(
          and(
            eq(schema.chainTransactions.itemId, itemId),
            inArray(schema.chainTransactions.action, ["register_item", "update_evidence"]),
          ),
        )
        .orderBy(desc(schema.chainTransactions.createdAt))
        .limit(1)
    )[0] ?? null;

  return {
    item: row.item,
    orgName: row.orgName,
    orgLocationRegion: row.orgLocationRegion,
    photos: photos.map((p) => ({
      id: p.id,
      url: photoUrl(p.storedPath),
      caption: p.caption,
      sha256: p.sha256,
    })),
    specs: specs.map((s) => ({
      id: s.id,
      label: s.label,
      value: s.value,
      source: s.source,
      basis: s.basis,
      confirmedByOwner: s.confirmedByOwner,
    })),
    evidence: evidenceRows.map((r) => ({
      id: r.e.id,
      kind: r.e.kind,
      source: r.e.source,
      statement: r.e.statement,
      recordedByOrgName: r.orgName ?? null,
      recordedAt: r.e.recordedAt,
    })),
    checklist,
    anchor: anchorRow
      ? {
          status: anchorRow.status,
          txHash: anchorRow.txHash,
          blockNumber: anchorRow.blockNumber,
          contractAddress: anchorRow.contractAddress,
          chainId: anchorRow.chainId,
          error: anchorRow.errorMessage || null,
          itemKey: itemIdToBytes32(itemId),
        }
      : {
          status: "not_anchored",
          txHash: null,
          blockNumber: null,
          contractAddress: null,
          chainId: null,
          error: null,
          itemKey: itemIdToBytes32(itemId),
        },
    manifest: manifest
      ? {
          versionNumber: manifest.versionNumber,
          manifestVersion: manifest.manifestVersion,
          sha256: manifest.sha256,
          createdAt: manifest.createdAt,
        }
      : null,
  };
}
