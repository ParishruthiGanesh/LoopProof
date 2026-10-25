import { createHash } from "node:crypto";

/**
 * The public evidence manifest is the exact, documented set of fields that the
 * anchored hash covers. It is built from public data only. Changing any field
 * listed here changes the digest; changing anything NOT listed here does not.
 *
 * Covered (public):
 *   itemId, manifestVersion, category, title, description,
 *   brand, model, conditionGrade, quantity,
 *   massKg + massBasis, locationRegion,
 *   confirmed specifications (label, value, source),
 *   known defects,
 *   test checklist results,
 *   public condition evidence statements (kind, source, statement, recordedAt),
 *   photo digests (sha256 + caption)
 *
 * Deliberately NOT covered, and never present in the manifest:
 *   contact emails or phone numbers, exact collection addresses,
 *   private operational notes, request messages, wallet private keys,
 *   raw image bytes, unconfirmed AI suggestions, internal database ids.
 */
export const MANIFEST_VERSION = "lp-manifest-1";

export type ManifestSpec = { label: string; value: string; source: string };
export type ManifestEvidence = { kind: string; source: string; statement: string; recordedAt: string };
export type ManifestPhoto = { sha256: string; caption: string };

export type EvidenceManifest = {
  manifestVersion: string;
  itemId: string;
  title: string;
  category: string;
  description: string;
  brand: string;
  model: string;
  conditionGrade: string;
  quantity: number;
  massKg: number | null;
  massBasis: string;
  locationRegion: string;
  knownDefects: string;
  specifications: ManifestSpec[];
  testChecklist: {
    powersOn: string;
    displayWorks: string;
    portsTested: string;
    cablesIncluded: string;
    notes: string;
  } | null;
  conditionEvidence: ManifestEvidence[];
  photos: ManifestPhoto[];
};

/** Fields the digest covers, for display in the app. */
export const MANIFEST_COVERED_FIELDS = [
  "manifestVersion",
  "itemId",
  "title",
  "category",
  "description",
  "brand",
  "model",
  "conditionGrade",
  "quantity",
  "massKg",
  "massBasis",
  "locationRegion",
  "knownDefects",
  "specifications[].label / .value / .source",
  "testChecklist.*",
  "conditionEvidence[].kind / .source / .statement / .recordedAt",
  "photos[].sha256 / .caption",
] as const;

export const MANIFEST_EXCLUDED_FIELDS = [
  "contact email and phone",
  "exact collection address",
  "private operational notes",
  "request messages between parties",
  "raw image bytes (only their SHA-256 digests are covered)",
  "unconfirmed AI suggestions",
  "wallet private keys (never stored anywhere)",
] as const;

/**
 * Deterministic serialisation: object keys sorted, arrays kept in their given
 * order, no insignificant whitespace, UTF-8. Two parties with the same manifest
 * data always produce byte-identical output, and therefore the same digest.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number in evidence manifest");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  throw new Error(`Unsupported value of type ${typeof value} in evidence manifest`);
}

export function sha256Hex(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

/** `0x`-prefixed digest, the form anchored on-chain as bytes32. */
export function manifestDigest(manifest: EvidenceManifest): {
  canonicalJson: string;
  sha256: string;
  bytes32: `0x${string}`;
} {
  const canonicalJson = canonicalize(manifest);
  const sha256 = sha256Hex(canonicalJson);
  return { canonicalJson, sha256, bytes32: `0x${sha256}` };
}

/** keccak256 is not used for the item key; a plain sha256 of the id is enough
 *  and keeps the off-chain and on-chain key derivation trivially reproducible. */
export function itemIdToBytes32(itemId: string): `0x${string}` {
  return `0x${sha256Hex(itemId)}`;
}

export type VerificationResult = {
  storedSha256: string;
  recomputedSha256: string;
  localMatch: boolean;
  anchoredSha256: string | null;
  anchorMatch: boolean | null;
  manifestVersion: string;
  /** Why there is no anchored digest to compare against, when there is none.
   *  "unreachable" must never be presented as "nothing was ever anchored". */
  anchorReadStatus: "found" | "not_registered" | "not_configured" | "unreachable";
  anchorReadError: string | null;
};
