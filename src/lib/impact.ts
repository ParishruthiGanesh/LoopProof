import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import { IMPACT_COUNTED_STATES } from "./transfer-state";

/**
 * Honest impact accounting.
 *
 * Rules this module enforces:
 *  - Publishing a listing earns nothing. Only a transfer in state "completed"
 *    counts, which requires both acknowledgments.
 *  - Pending, reserved, released, declined, cancelled and disputed transfers
 *    are counted separately and never folded into the confirmed totals.
 *  - Mass is reported in two buckets: measured and estimated. They are never
 *    added together into one headline number.
 *  - Replacement value is reported as the owners' own estimate unless a listing
 *    carries quoted evidence.
 *  - An emissions figure is produced ONLY when every assumption it depends on
 *    is present in impact_assumptions and marked available. Otherwise the
 *    number is withheld and the missing inputs are named.
 */

export type ImpactScope = "all" | "real_only" | "demo_only";

export type MassBucket = { kg: number; itemCount: number };

export type AssumptionView = {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  source: string;
  sourceVersion: string;
  notes: string;
  isAvailable: boolean;
};

export type EmissionsScenario =
  | {
      available: true;
      /** kg CO2e, net of transport and refurbishment. */
      lowKg: number;
      centralKg: number;
      highKg: number;
      formula: string;
      displacementRate: number;
      massUsedKg: number;
      massBasisNote: string;
      assumptions: AssumptionView[];
      caveats: string[];
    }
  | {
      available: false;
      reason: string;
      missingInputs: string[];
      assumptions: AssumptionView[];
    };

export type ImpactReport = {
  scope: ImpactScope;
  generatedAt: string;
  confirmed: {
    completedTransferCount: number;
    itemCount: number;
    unitCount: number;
    measuredMass: MassBucket;
    estimatedMass: MassBucket;
    unknownMassItemCount: number;
    replacementValueOwnerEstimate: number;
    replacementValueQuotedEvidence: number;
    itemsWithoutValue: number;
  };
  notCounted: {
    availableListings: number;
    openRequests: number;
    requestedTransfers: number;
    activeReservations: number;
    declinedTransfers: number;
    cancelledTransfers: number;
    disputedTransfers: number;
  };
  emissions: EmissionsScenario;
  dataQuality: {
    completedItemsWithMeasuredMass: number;
    completedItemsWithEstimatedMass: number;
    completedItemsWithNoMass: number;
    completedItemsWithTestEvidence: number;
    completedItemsWithRecipientConfirmation: number;
  };
};

const REQUIRED_EMISSION_KEYS = [
  "displaced_production_kgco2e_per_kg",
  "displacement_rate",
  "transport_kgco2e_per_item",
  "refurbishment_kgco2e_per_item",
  "scenario_uncertainty_fraction",
] as const;

export async function loadAssumptions(): Promise<AssumptionView[]> {
  const db = getDb();
  const rows = await db.select().from(schema.impactAssumptions);
  return rows
    .map((r) => ({
      key: r.key,
      label: r.label,
      value: r.value,
      unit: r.unit,
      source: r.source,
      sourceVersion: r.sourceVersion,
      notes: r.notes,
      isAvailable: r.isAvailable,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export async function buildImpactReport(scope: ImpactScope = "all"): Promise<ImpactReport> {
  const db = getDb();

  const demoFilter = <T extends { isDemo: unknown }>(column: T["isDemo"]) =>
    scope === "all" ? undefined : eq(column as never, scope === "demo_only");

  // --- confirmed completed transfers ---------------------------------------
  const completedWhere = demoFilter(schema.transfers.isDemo);
  const completed = await db
    .select({ transfer: schema.transfers, item: schema.items })
    .from(schema.transfers)
    .innerJoin(schema.items, eq(schema.items.id, schema.transfers.itemId))
    .where(
      completedWhere
        ? and(inArray(schema.transfers.state, IMPACT_COUNTED_STATES), completedWhere)
        : inArray(schema.transfers.state, IMPACT_COUNTED_STATES),
    );

  // Defensive: the database CHECK constraint already forbids this, but impact
  // numbers are the one place where a silent miscount would matter most.
  const trulyCompleted = completed.filter(
    (r) => r.transfer.donorReleaseAck && r.transfer.recipientReceiptAck,
  );

  const measuredMass: MassBucket = { kg: 0, itemCount: 0 };
  const estimatedMass: MassBucket = { kg: 0, itemCount: 0 };
  let unknownMassItemCount = 0;
  let unitCount = 0;
  let replacementValueOwnerEstimate = 0;
  let replacementValueQuotedEvidence = 0;
  let itemsWithoutValue = 0;

  for (const row of trulyCompleted) {
    const units = row.transfer.quantity;
    unitCount += units;
    const mass = row.item.massKg;
    if (mass != null && row.item.massBasis === "measured") {
      measuredMass.kg += mass * units;
      measuredMass.itemCount += 1;
    } else if (mass != null && row.item.massBasis === "estimated") {
      estimatedMass.kg += mass * units;
      estimatedMass.itemCount += 1;
    } else {
      unknownMassItemCount += 1;
    }

    const value = row.item.replacementValue;
    if (value == null) itemsWithoutValue += 1;
    else if (row.item.replacementValueBasis === "quoted_evidence") replacementValueQuotedEvidence += value * units;
    else replacementValueOwnerEstimate += value * units;
  }

  const completedItemIds = trulyCompleted.map((r) => r.item.id);
  const evidence = completedItemIds.length
    ? await db
        .select()
        .from(schema.conditionEvidence)
        .where(inArray(schema.conditionEvidence.itemId, completedItemIds))
    : [];
  const withTest = new Set(
    evidence.filter((e) => e.source === "documented_test").map((e) => e.itemId),
  );
  const withRecipient = new Set(
    evidence.filter((e) => e.source === "recipient_confirmed").map((e) => e.itemId),
  );

  // --- everything deliberately NOT counted ---------------------------------
  const countTransfers = async (states: (typeof schema.TRANSFER_STATES)[number][]) => {
    const where = demoFilter(schema.transfers.isDemo);
    const rows = await db
      .select({ id: schema.transfers.id })
      .from(schema.transfers)
      .where(where ? and(inArray(schema.transfers.state, states), where) : inArray(schema.transfers.state, states));
    return rows.length;
  };

  const itemsWhere = demoFilter(schema.items.isDemo);
  const availableListings = (
    await db
      .select({ id: schema.items.id })
      .from(schema.items)
      .where(itemsWhere ? and(eq(schema.items.status, "available"), itemsWhere) : eq(schema.items.status, "available"))
  ).length;

  const requestsWhere = demoFilter(schema.requests.isDemo);
  const openRequests = (
    await db
      .select({ id: schema.requests.id })
      .from(schema.requests)
      .where(requestsWhere ? and(eq(schema.requests.status, "open"), requestsWhere) : eq(schema.requests.status, "open"))
  ).length;

  const notCounted = {
    availableListings,
    openRequests,
    requestedTransfers: await countTransfers(["requested"]),
    activeReservations: await countTransfers(["reserved", "released"]),
    declinedTransfers: await countTransfers(["declined"]),
    cancelledTransfers: await countTransfers(["cancelled"]),
    disputedTransfers: await countTransfers(["disputed"]),
  };

  const assumptions = await loadAssumptions();
  const emissions = buildEmissionsScenario(assumptions, {
    measuredKg: measuredMass.kg,
    estimatedKg: estimatedMass.kg,
    itemsWithMass: measuredMass.itemCount + estimatedMass.itemCount,
    unitCount,
    unknownMassItemCount,
  });

  return {
    scope,
    generatedAt: new Date().toISOString(),
    confirmed: {
      completedTransferCount: trulyCompleted.length,
      itemCount: new Set(completedItemIds).size,
      unitCount,
      measuredMass: { kg: round(measuredMass.kg), itemCount: measuredMass.itemCount },
      estimatedMass: { kg: round(estimatedMass.kg), itemCount: estimatedMass.itemCount },
      unknownMassItemCount,
      replacementValueOwnerEstimate: round(replacementValueOwnerEstimate),
      replacementValueQuotedEvidence: round(replacementValueQuotedEvidence),
      itemsWithoutValue,
    },
    notCounted,
    emissions,
    dataQuality: {
      completedItemsWithMeasuredMass: measuredMass.itemCount,
      completedItemsWithEstimatedMass: estimatedMass.itemCount,
      completedItemsWithNoMass: unknownMassItemCount,
      completedItemsWithTestEvidence: withTest.size,
      completedItemsWithRecipientConfirmation: withRecipient.size,
    },
  };
}

function buildEmissionsScenario(
  assumptions: AssumptionView[],
  totals: {
    measuredKg: number;
    estimatedKg: number;
    itemsWithMass: number;
    unitCount: number;
    unknownMassItemCount: number;
  },
): EmissionsScenario {
  const byKey = new Map(assumptions.map((a) => [a.key, a]));
  const missingInputs: string[] = [];

  for (const key of REQUIRED_EMISSION_KEYS) {
    const a = byKey.get(key);
    if (!a || !a.isAvailable || a.value == null) {
      missingInputs.push(
        a ? `${a.label} (${key}) — no defensible value and source recorded` : `${key} — assumption not defined`,
      );
    }
  }

  const massKg = totals.measuredKg + totals.estimatedKg;
  if (massKg <= 0) {
    missingInputs.push("Recorded mass of completed transfers is zero, so there is nothing to scale a factor by.");
  }

  if (missingInputs.length > 0) {
    return {
      available: false,
      reason:
        "No CO2e figure is shown. LoopProof only reports avoided emissions when every factor below is present with a named source and version. Inventing a convenient factor would make the number meaningless.",
      missingInputs,
      assumptions,
    };
  }

  const factor = byKey.get("displaced_production_kgco2e_per_kg")!.value!;
  const displacementRate = byKey.get("displacement_rate")!.value!;
  const transportPerItem = byKey.get("transport_kgco2e_per_item")!.value!;
  const refurbPerItem = byKey.get("refurbishment_kgco2e_per_item")!.value!;
  const uncertainty = byKey.get("scenario_uncertainty_fraction")!.value!;

  const avoidedProduction = massKg * factor * displacementRate;
  const additional = totals.unitCount * (transportPerItem + refurbPerItem);
  const central = avoidedProduction - additional;

  const used = REQUIRED_EMISSION_KEYS.map((k) => byKey.get(k)!).filter(Boolean);

  return {
    available: true,
    lowKg: round(central * (1 - uncertainty)),
    centralKg: round(central),
    highKg: round(central * (1 + uncertainty)),
    formula:
      "net avoided kg CO2e = (recorded mass kg x displaced-production factor x displacement rate) - (units x (transport + refurbishment per unit))",
    displacementRate,
    massUsedKg: round(massKg),
    massBasisNote: `${round(totals.measuredKg)} kg measured and ${round(totals.estimatedKg)} kg estimated; ${totals.unknownMassItemCount} completed item(s) have no recorded mass and contribute nothing.`,
    assumptions: used,
    caveats: [
      "This is a scenario estimate under the stated assumptions, not a certified or verified carbon saving.",
      "A completed transfer does not by itself prove that landfill was avoided or that a new purchase was displaced; the displacement rate is the assumption that stands in for that.",
      "Items with no recorded mass are excluded entirely rather than being filled in with a guess.",
      "No carbon credits, tradable tokens or environmental certificates are issued by LoopProof.",
    ],
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
