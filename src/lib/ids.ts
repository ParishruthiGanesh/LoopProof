import { randomBytes, randomUUID } from "node:crypto";

export const uuid = () => randomUUID();

const CATEGORY_PREFIX: Record<string, string> = {
  monitor: "MON",
  peripheral: "PER",
  small_electronics: "ELE",
  networking: "NET",
  furniture: "FUR",
  other: "GEN",
};

/**
 * Stable, human-readable public item id, e.g. LP-MON-7F3K2Q.
 * The suffix is random rather than sequential so the id does not leak how many
 * items an organization has listed.
 */
export function newItemId(category: string): string {
  const prefix = CATEGORY_PREFIX[category] ?? "GEN";
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I, L, O, 0, 1
  const bytes = randomBytes(6);
  let suffix = "";
  for (const b of bytes) suffix += alphabet[b % alphabet.length];
  return `LP-${prefix}-${suffix}`;
}

export const newRequestId = () => `REQ-${shortCode(6)}`;
export const newTransferId = () => `TRN-${shortCode(6)}`;

function shortCode(len: number) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(len);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
