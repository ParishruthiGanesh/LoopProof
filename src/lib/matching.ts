import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import { uuid } from "./ids";
import { semanticRankCandidates } from "./ai";
import { aiLiveEnabled } from "./env";

/**
 * Matching is two separate things, kept separate on purpose:
 *
 *  1. Hard eligibility rules. These decide whether an item CAN satisfy a
 *     request at all. An item that fails one is marked ineligible with the
 *     blocking reason named; it is never nudged into the list anyway.
 *
 *  2. Ordering among eligible candidates. By default this is rule-based: how
 *     many of the request's stated requirements the item demonstrably meets.
 *     When a model key is configured, the plain-language part of the request
 *     is additionally interpreted and used to reorder, with the model's own
 *     reason attached. No probability or confidence number is produced.
 */

const CONDITION_RANK: Record<string, number> = {
  working_good: 5,
  working_marks: 4,
  working_defects: 3,
  untested: 2,
  parts_only: 1,
};

export type RequiredSpec = { label: string; value: string; required: boolean };

export function parseRequiredSpecs(json: string): RequiredSpec[] {
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r) => r && typeof r.label === "string" && typeof r.value === "string")
      .map((r) => ({ label: String(r.label), value: String(r.value), required: Boolean(r.required) }));
  } catch {
    return [];
  }
}

export type MatchCandidate = {
  itemId: string;
  title: string;
  orgId: string;
  orgName: string;
  category: string;
  conditionGrade: string;
  quantity: number;
  locationRegion: string;
  status: string;
  isDemo: boolean;
  photoPath: string | null;
  eligible: boolean;
  constraintsMet: number;
  constraintsChecked: number;
  reasons: string[];
  blockers: string[];
  missingInfo: string[];
  distanceKm: number | null;
  distanceBasis: "region_centroid" | "unknown";
  semanticRank: number | null;
  semanticReason: string | null;
  method: "rules" | "rules_and_semantic";
};

export type MatchRunResult = {
  requestId: string;
  method: "rules" | "rules_and_semantic";
  semanticNote: string | null;
  semanticUnavailableReason: string | null;
  eligible: MatchCandidate[];
  ineligible: MatchCandidate[];
};

/** Great-circle distance. Only used when both sides have coordinates. */
function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function runMatching(requestId: string, options: { useSemantic?: boolean } = {}): Promise<MatchRunResult> {
  const db = getDb();
  const requestRows = await db.select().from(schema.requests).where(eq(schema.requests.id, requestId)).limit(1);
  const request = requestRows[0];
  if (!request) throw new Error(`Unknown request ${requestId}`);

  const requiredSpecs = parseRequiredSpecs(request.requiredSpecs);

  // Candidate pool: everything currently offerable, excluding the requester's
  // own listings (an organization matching itself is noise, not a match).
  const itemRows = await db
    .select({
      item: schema.items,
      orgName: schema.organizations.name,
      orgLat: schema.organizations.latitude,
      orgLon: schema.organizations.longitude,
    })
    .from(schema.items)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.items.orgId))
    .where(inArray(schema.items.status, ["available", "reserved"]));

  const itemIds = itemRows.map((r) => r.item.id);
  const specs = itemIds.length
    ? await db
        .select()
        .from(schema.itemSpecs)
        .where(and(inArray(schema.itemSpecs.itemId, itemIds), eq(schema.itemSpecs.confirmedByOwner, true)))
    : [];
  const checklists = itemIds.length
    ? await db.select().from(schema.testChecklists).where(inArray(schema.testChecklists.itemId, itemIds))
    : [];
  const photos = itemIds.length
    ? await db
        .select()
        .from(schema.itemPhotos)
        .where(and(inArray(schema.itemPhotos.itemId, itemIds), eq(schema.itemPhotos.isPublic, true)))
    : [];

  const specsByItem = new Map<string, typeof specs>();
  for (const s of specs) {
    const list = specsByItem.get(s.itemId) ?? [];
    list.push(s);
    specsByItem.set(s.itemId, list);
  }
  const checklistByItem = new Map(checklists.map((c) => [c.itemId, c]));
  const photoByItem = new Map<string, string>();
  for (const p of photos.sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!photoByItem.has(p.itemId)) photoByItem.set(p.itemId, p.storedPath);
  }

  const candidates: MatchCandidate[] = [];

  for (const row of itemRows) {
    const item = row.item;
    if (item.orgId === request.orgId) continue;

    const reasons: string[] = [];
    const blockers: string[] = [];
    const missingInfo: string[] = [];
    let checked = 0;
    let met = 0;

    // 1. Category — hard requirement.
    checked += 1;
    if (item.category === request.category) {
      met += 1;
      reasons.push(`Category matches the request (${labelCategory(item.category)}).`);
    } else {
      blockers.push(
        `Category is ${labelCategory(item.category)}, but the request is for ${labelCategory(request.category)}.`,
      );
    }

    // 2. Availability — hard requirement.
    checked += 1;
    if (item.status === "available") {
      met += 1;
      reasons.push("Item is currently available.");
    } else {
      blockers.push("Item is already reserved for another recipient.");
    }

    // 3. Quantity — hard requirement.
    checked += 1;
    if (item.quantity >= request.quantity) {
      met += 1;
      reasons.push(`Offers ${item.quantity}, the request needs ${request.quantity}.`);
    } else {
      blockers.push(`Only ${item.quantity} available; the request needs ${request.quantity}.`);
    }

    // 4. Condition floor — hard requirement.
    checked += 1;
    const itemRank = CONDITION_RANK[item.conditionGrade] ?? 0;
    const floorRank = CONDITION_RANK[request.minConditionGrade] ?? 0;
    if (itemRank >= floorRank) {
      met += 1;
      reasons.push(
        `Condition "${labelCondition(item.conditionGrade)}" meets the stated floor of "${labelCondition(request.minConditionGrade)}".`,
      );
    } else {
      blockers.push(
        `Condition "${labelCondition(item.conditionGrade)}" is below the stated floor of "${labelCondition(request.minConditionGrade)}".`,
      );
    }

    // 5. Collection deadline — hard requirement when both dates exist.
    if (request.collectionDeadline) {
      checked += 1;
      if (!item.collectionWindowStart) {
        missingInfo.push("This listing does not state a collection window, so the deadline cannot be checked.");
        reasons.push("Collection window not stated by the donor.");
      } else if (item.collectionWindowStart <= request.collectionDeadline) {
        met += 1;
        reasons.push(`Collection can start by ${formatDate(item.collectionWindowStart)}, within the deadline.`);
      } else {
        blockers.push(
          `Earliest collection is ${formatDate(item.collectionWindowStart)}, after the request's deadline of ${formatDate(request.collectionDeadline)}.`,
        );
      }
    }

    // 6. Cables, when the recipient said they need them.
    if (request.needsCablesIncluded) {
      checked += 1;
      const checklist = checklistByItem.get(item.id);
      if (!checklist) {
        missingInfo.push("No testing checklist recorded, so it is not known whether cables are included.");
      } else if (checklist.cablesIncluded === "yes") {
        met += 1;
        reasons.push("Donor recorded that cables are included.");
      } else if (checklist.cablesIncluded === "partial") {
        missingInfo.push("Donor recorded that cables are only partially included.");
      } else {
        blockers.push("Request needs cables included; the donor recorded that they are not.");
      }
    }

    // 7. Required specifications stated by the recipient.
    const itemSpecList = specsByItem.get(item.id) ?? [];
    for (const required of requiredSpecs) {
      checked += 1;
      const found = itemSpecList.find(
        (s) => s.label.toLowerCase().trim() === required.label.toLowerCase().trim(),
      );
      if (!found) {
        missingInfo.push(`The listing does not state "${required.label}", which this request asks for.`);
        if (required.required) {
          blockers.push(`Required specification "${required.label}" is not confirmed on this listing.`);
        }
        continue;
      }
      if (specSatisfies(found.value, required.value)) {
        met += 1;
        reasons.push(`${required.label}: listing states "${found.value}" (${labelSource(found.source)}).`);
      } else if (required.required) {
        blockers.push(`${required.label} is "${found.value}", but the request requires "${required.value}".`);
      } else {
        missingInfo.push(`${required.label} is "${found.value}"; the request prefers "${required.value}".`);
      }
    }

    // 8. Distance — only when both sides actually have coordinates.
    let distanceKm: number | null = null;
    let distanceBasis: "region_centroid" | "unknown" = "unknown";
    if (
      request.latitude != null &&
      request.longitude != null &&
      row.orgLat != null &&
      row.orgLon != null
    ) {
      distanceKm = Math.round(haversineKm(request.latitude, request.longitude, row.orgLat, row.orgLon) * 10) / 10;
      distanceBasis = "region_centroid";
      if (request.maxDistanceKm != null) {
        checked += 1;
        if (distanceKm <= request.maxDistanceKm) {
          met += 1;
          reasons.push(`About ${distanceKm} km away (region centroids), within the ${request.maxDistanceKm} km limit.`);
        } else {
          blockers.push(`About ${distanceKm} km away, beyond the request's ${request.maxDistanceKm} km limit.`);
        }
      } else {
        reasons.push(`About ${distanceKm} km away, measured between region centroids.`);
      }
    } else {
      missingInfo.push("Distance is unknown: one or both sides have no coordinates recorded, only a named region.");
    }

    candidates.push({
      itemId: item.id,
      title: item.title,
      orgId: item.orgId,
      orgName: row.orgName,
      category: item.category,
      conditionGrade: item.conditionGrade,
      quantity: item.quantity,
      locationRegion: item.locationRegion,
      status: item.status,
      isDemo: item.isDemo,
      photoPath: photoByItem.get(item.id) ?? null,
      eligible: blockers.length === 0,
      constraintsMet: met,
      constraintsChecked: checked,
      reasons,
      blockers,
      missingInfo,
      distanceKm,
      distanceBasis,
      semanticRank: null,
      semanticReason: null,
      method: "rules",
    });
  }

  let eligible = candidates.filter((c) => c.eligible);
  const ineligible = candidates.filter((c) => !c.eligible);

  // Rule-based ordering: most requirements demonstrably met, then nearest.
  eligible.sort((a, b) => {
    const ratio = b.constraintsMet / Math.max(b.constraintsChecked, 1) - a.constraintsMet / Math.max(a.constraintsChecked, 1);
    if (Math.abs(ratio) > 1e-9) return ratio;
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
    return a.itemId.localeCompare(b.itemId);
  });

  let method: "rules" | "rules_and_semantic" = "rules";
  let semanticNote: string | null = null;
  let semanticUnavailableReason: string | null = null;

  const wantSemantic = options.useSemantic !== false && request.freeText.trim().length > 20;
  if (wantSemantic && !aiLiveEnabled()) {
    semanticUnavailableReason =
      "Semantic interpretation of the plain-language request needs ANTHROPIC_API_KEY. Ranking below is rule-based only.";
  } else if (wantSemantic && eligible.length <= 1) {
    semanticUnavailableReason =
      eligible.length === 0
        ? "Nothing passed the hard eligibility rules, so there was nothing to interpret the request against."
        : "Only one candidate passed the hard eligibility rules, so there was nothing to reorder.";
  } else if (wantSemantic) {
    const outcome = await semanticRankCandidates({
      requestTitle: request.title,
      requestFreeText: request.freeText,
      candidates: eligible.map((c) => ({
        itemId: c.itemId,
        title: c.title,
        description: "",
        conditionGrade: c.conditionGrade,
        specs: (specsByItem.get(c.itemId) ?? []).map((s) => `${s.label}: ${s.value}`),
      })),
    });
    if (outcome.ok) {
      method = "rules_and_semantic";
      semanticNote = outcome.result.interpretationOfRequest || null;
      const noteById = new Map(outcome.result.notes.map((n) => [n.itemId, n]));
      const order = new Map(outcome.result.rankedItemIds.map((id, index) => [id, index]));
      for (const c of eligible) {
        const note = noteById.get(c.itemId);
        c.semanticReason = note?.reason ?? null;
        c.semanticRank = order.get(c.itemId) ?? null;
        c.method = "rules_and_semantic";
        for (const missing of note?.missingInformation ?? []) {
          if (!c.missingInfo.includes(missing)) c.missingInfo.push(missing);
        }
      }
      // Eligibility stays rule-based; the model only reorders what passed.
      eligible = [...eligible].sort((a, b) => {
        const ar = a.semanticRank ?? Number.MAX_SAFE_INTEGER;
        const br = b.semanticRank ?? Number.MAX_SAFE_INTEGER;
        return ar - br;
      });
    } else {
      semanticUnavailableReason = `${outcome.error} Ranking below is rule-based only.`;
    }
  }

  // Persist so the dashboard and the request page show the same numbers.
  await db.delete(schema.matchResults).where(eq(schema.matchResults.requestId, requestId));
  const all = [...eligible, ...ineligible];
  if (all.length) {
    await db.insert(schema.matchResults).values(
      all.map((c) => ({
        id: uuid(),
        requestId,
        itemId: c.itemId,
        eligible: c.eligible,
        constraintsMet: c.constraintsMet,
        constraintsChecked: c.constraintsChecked,
        semanticRank: c.semanticRank,
        method: c.method,
        reasons: JSON.stringify(c.reasons),
        blockers: JSON.stringify(c.blockers),
        missingInfo: JSON.stringify(c.missingInfo),
        distanceKm: c.distanceKm,
        distanceBasis: c.distanceBasis,
        computedAt: new Date().toISOString(),
      })),
    );
  }

  return { requestId, method, semanticNote, semanticUnavailableReason, eligible, ineligible };
}

/** Loose comparison: numeric thresholds like "1920x1080" or ">=22 in". */
function specSatisfies(itemValue: string, requiredValue: string): boolean {
  const a = itemValue.toLowerCase().trim();
  const b = requiredValue.toLowerCase().trim();
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const minMatch = b.match(/^(?:>=|at least|min(?:imum)?)\s*([\d.]+)/);
  if (minMatch) {
    const itemNumber = Number(a.match(/[\d.]+/)?.[0] ?? NaN);
    return Number.isFinite(itemNumber) && itemNumber >= Number(minMatch[1]);
  }
  const pixels = (v: string) => {
    const m = v.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/);
    return m ? Number(m[1]) * Number(m[2]) : null;
  };
  const pa = pixels(a);
  const pb = pixels(b);
  if (pa != null && pb != null) return pa >= pb;
  return false;
}

export const labelCategory = (c: string) =>
  ({
    monitor: "Monitor",
    peripheral: "Peripheral",
    small_electronics: "Small electronics",
    networking: "Networking",
    furniture: "Furniture",
    other: "Other",
  })[c] ?? c;

export const labelCondition = (c: string) =>
  ({
    working_good: "Working, good condition",
    working_marks: "Working, cosmetic marks",
    working_defects: "Working with known defects",
    untested: "Untested",
    parts_only: "For parts only",
  })[c] ?? c;

export const labelSource = (s: string) =>
  ({
    owner_reported: "owner reported",
    documented_test: "documented test",
    recipient_confirmed: "recipient confirmed",
    ai_suggested_unconfirmed: "AI suggested, unconfirmed",
  })[s] ?? s;

const formatDate = (iso: string) => iso.slice(0, 10);
