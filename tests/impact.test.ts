import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createHarness, sessionFor, ORGS, type Harness } from "./helpers";

describe("impact accounting", () => {
  let harness: Harness;
  let impact: typeof import("../src/lib/impact");
  let transfers: typeof import("../src/lib/transfers");

  before(async () => {
    harness = await createHarness("impact");
    impact = await import("../src/lib/impact");
    transfers = await import("../src/lib/transfers");
  });
  after(() => harness.cleanup());

  it("counts only the seeded completed transfer, not the pending, cancelled or disputed ones", async () => {
    const report = await impact.buildImpactReport("all");

    assert.equal(report.confirmed.completedTransferCount, 1);
    assert.equal(report.notCounted.requestedTransfers, 1);
    assert.equal(report.notCounted.cancelledTransfers, 1);
    assert.equal(report.notCounted.disputedTransfers, 1);

    // The disputed transfer's donor did acknowledge release. That must not
    // leak into the confirmed total.
    const disputed = harness.sqlite
      .prepare("SELECT donor_release_ack FROM transfers WHERE state = 'disputed'")
      .get() as { donor_release_ack: number };
    assert.equal(disputed.donor_release_ack, 1);
    assert.equal(report.confirmed.completedTransferCount, 1);
  });

  it("awards nothing for publishing a listing", async () => {
    const before = await impact.buildImpactReport("all");
    const { uuid } = await import("../src/lib/ids");
    harness.sqlite
      .prepare(
        `INSERT INTO items (id, org_id, title, category, description, condition_grade, quantity, status, is_demo)
         VALUES ('LP-MON-NEWONE', ?, 'A newly published monitor', 'monitor', 'desc', 'working_good', 3, 'available', 0)`,
      )
      .run(ORGS.donor);
    void uuid;

    const after = await impact.buildImpactReport("all");
    assert.equal(
      after.confirmed.completedTransferCount,
      before.confirmed.completedTransferCount,
      "publishing must not change confirmed impact",
    );
    assert.equal(after.notCounted.availableListings, before.notCounted.availableListings + 1);
  });

  it("awards nothing for a reservation, and only credits after both acknowledgments", async () => {
    const item = "LP-MON-K4T2PQ"; // 4 monitors, 5.4 kg each, measured
    const baseline = await impact.buildImpactReport("all");

    const { transferId } = transfers.submitRequest({
      itemId: item,
      recipientOrgId: ORGS.recipient,
      message: "Four monitors for the classroom.",
      quantity: 4,
    });
    await transfers.applyTransferAction({
      transferId,
      action: "accept",
      user: sessionFor(harness.sqlite, ORGS.donor),
    });

    let report = await impact.buildImpactReport("all");
    assert.equal(report.confirmed.completedTransferCount, baseline.confirmed.completedTransferCount);
    assert.equal(report.notCounted.activeReservations, baseline.notCounted.activeReservations + 1);

    await transfers.applyTransferAction({
      transferId,
      action: "record_release",
      user: sessionFor(harness.sqlite, ORGS.donor),
    });
    report = await impact.buildImpactReport("all");
    assert.equal(
      report.confirmed.completedTransferCount,
      baseline.confirmed.completedTransferCount,
      "one acknowledgment is not enough",
    );

    await transfers.applyTransferAction({
      transferId,
      action: "record_receipt",
      user: sessionFor(harness.sqlite, ORGS.recipient),
      conditionConfirmed: true,
    });
    report = await impact.buildImpactReport("all");
    assert.equal(report.confirmed.completedTransferCount, baseline.confirmed.completedTransferCount + 1);
    assert.equal(report.confirmed.unitCount, baseline.confirmed.unitCount + 4);

    // Mass is quantity-weighted and lands in the measured bucket.
    assert.equal(
      Math.round((report.confirmed.measuredMass.kg - baseline.confirmed.measuredMass.kg) * 10) / 10,
      21.6,
      "4 units at 5.4 kg measured",
    );
    assert.equal(report.confirmed.estimatedMass.kg, baseline.confirmed.estimatedMass.kg);
  });

  it("keeps measured and estimated mass in separate buckets", async () => {
    const item = "LP-FUR-M2SK8H"; // chairs, 12 kg estimated
    const baseline = await impact.buildImpactReport("all");

    const { transferId } = transfers.submitRequest({
      itemId: item,
      recipientOrgId: ORGS.recipient,
      message: "Two chairs.",
      quantity: 2,
    });
    await transfers.applyTransferAction({
      transferId,
      action: "accept",
      user: sessionFor(harness.sqlite, ORGS.donor),
    });
    await transfers.applyTransferAction({
      transferId,
      action: "record_release",
      user: sessionFor(harness.sqlite, ORGS.donor),
    });
    await transfers.applyTransferAction({
      transferId,
      action: "record_receipt",
      user: sessionFor(harness.sqlite, ORGS.recipient),
      conditionConfirmed: true,
    });

    const report = await impact.buildImpactReport("all");
    assert.equal(report.confirmed.estimatedMass.kg - baseline.confirmed.estimatedMass.kg, 24);
    assert.equal(
      report.confirmed.measuredMass.kg,
      baseline.confirmed.measuredMass.kg,
      "estimated mass must not be added to the measured bucket",
    );
  });

  it("excludes an item with no recorded mass rather than guessing one", async () => {
    const item = "LP-PER-Q7ZT3N"; // webcams, mass_kg is null
    const baseline = await impact.buildImpactReport("all");

    const { transferId } = transfers.submitRequest({
      itemId: item,
      recipientOrgId: ORGS.recipient,
      message: "Four webcams.",
      quantity: 4,
    });
    await transfers.applyTransferAction({
      transferId,
      action: "accept",
      user: sessionFor(harness.sqlite, ORGS.other),
    });
    await transfers.applyTransferAction({
      transferId,
      action: "record_release",
      user: sessionFor(harness.sqlite, ORGS.other),
    });
    await transfers.applyTransferAction({
      transferId,
      action: "record_receipt",
      user: sessionFor(harness.sqlite, ORGS.recipient),
      conditionConfirmed: true,
    });

    const report = await impact.buildImpactReport("all");
    assert.equal(report.confirmed.completedTransferCount, baseline.confirmed.completedTransferCount + 1);
    assert.equal(report.confirmed.measuredMass.kg, baseline.confirmed.measuredMass.kg);
    assert.equal(report.confirmed.estimatedMass.kg, baseline.confirmed.estimatedMass.kg);
    assert.equal(report.confirmed.unknownMassItemCount, baseline.confirmed.unknownMassItemCount + 1);
  });

  it("removes a transfer from confirmed totals once it is disputed", async () => {
    const completed = harness.sqlite
      .prepare("SELECT id FROM transfers WHERE state = 'completed' ORDER BY completed_at DESC LIMIT 1")
      .get() as { id: string };
    const before = await impact.buildImpactReport("all");

    await transfers.applyTransferAction({
      transferId: completed.id,
      action: "report_problem",
      user: sessionFor(harness.sqlite, ORGS.recipient),
      note: "One unit failed two days after collection.",
    });

    const after = await impact.buildImpactReport("all");
    assert.equal(after.confirmed.completedTransferCount, before.confirmed.completedTransferCount - 1);
    assert.equal(after.notCounted.disputedTransfers, before.notCounted.disputedTransfers + 1);
  });

  it("separates seeded demonstration records from records created in the app", async () => {
    const all = await impact.buildImpactReport("all");
    const demo = await impact.buildImpactReport("demo_only");
    const real = await impact.buildImpactReport("real_only");

    assert.equal(
      demo.confirmed.completedTransferCount + real.confirmed.completedTransferCount,
      all.confirmed.completedTransferCount,
    );
    assert.ok(real.confirmed.completedTransferCount > 0, "the transfers created in this test are real records");
    assert.ok(demo.notCounted.availableListings > 0);
  });

  it("withholds the CO2e figure and names the missing inputs", async () => {
    const report = await impact.buildImpactReport("all");
    assert.equal(report.emissions.available, false);
    if (report.emissions.available) return;

    assert.match(report.emissions.reason, /No CO2e figure is shown/);
    assert.ok(report.emissions.missingInputs.length >= 4);
    assert.ok(
      report.emissions.missingInputs.some((m) => m.includes("displaced_production_kgco2e_per_kg")),
      "the missing production factor must be named",
    );
    assert.ok(
      report.emissions.missingInputs.some((m) => m.includes("displacement_rate")),
      "the missing displacement rate must be named",
    );
  });

  it("produces a scenario with a range once every factor has a source", async () => {
    const stamp = new Date().toISOString();
    const update = harness.sqlite.prepare(
      "UPDATE impact_assumptions SET value = ?, source = ?, source_version = ?, is_available = 1, updated_at = ? WHERE key = ?",
    );
    update.run(12.5, "Illustrative test factor", "test-1", stamp, "displaced_production_kgco2e_per_kg");
    update.run(0.6, "Illustrative test factor", "test-1", stamp, "displacement_rate");
    update.run(1.2, "Illustrative test factor", "test-1", stamp, "transport_kgco2e_per_item");
    update.run(0.8, "Illustrative test factor", "test-1", stamp, "refurbishment_kgco2e_per_item");

    const report = await impact.buildImpactReport("all");
    assert.equal(report.emissions.available, true);
    if (!report.emissions.available) return;

    const mass = report.confirmed.measuredMass.kg + report.confirmed.estimatedMass.kg;
    const expected = mass * 12.5 * 0.6 - report.confirmed.unitCount * 2;
    assert.equal(report.emissions.centralKg, Math.round(expected * 100) / 100);
    assert.ok(report.emissions.lowKg < report.emissions.centralKg);
    assert.ok(report.emissions.highKg > report.emissions.centralKg);
    assert.equal(report.emissions.assumptions.length, 5);
    assert.ok(report.emissions.caveats.some((c) => /not a certified/.test(c)));
    assert.ok(report.emissions.caveats.some((c) => /No carbon credits/.test(c)));
  });
});
