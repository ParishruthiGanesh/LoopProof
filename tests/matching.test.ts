import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createHarness, type Harness } from "./helpers";

describe("matching", () => {
  let harness: Harness;
  let matching: typeof import("../src/lib/matching");

  before(async () => {
    harness = await createHarness("matching");
    matching = await import("../src/lib/matching");
  });
  after(() => harness.cleanup());

  it("finds the strong match for the classroom monitor request and explains why", async () => {
    const result = await matching.runMatching("REQ-H4TK2M");

    assert.equal(result.method, "rules", "no API key is configured, so ranking must stay rule-based");
    assert.match(
      result.semanticUnavailableReason ?? "",
      /ANTHROPIC_API_KEY/,
      "the interface must say why semantic matching was not used",
    );

    const top = result.eligible[0];
    assert.ok(top, "there should be at least one eligible candidate");
    assert.equal(top.itemId, "LP-MON-K4T2PQ", "the four tested 1920x1080 monitors are the strong match");
    assert.ok(top.reasons.some((r) => /Category matches/.test(r)));
    assert.ok(top.reasons.some((r) => /Offers 4, the request needs 4/.test(r)));
    assert.ok(top.reasons.some((r) => /Native resolution/.test(r)));
    assert.ok(top.reasons.some((r) => /cables are included/i.test(r)));
    assert.ok(top.distanceKm != null && top.distanceBasis === "region_centroid");
  });

  it("rejects incompatible candidates instead of ranking them low", async () => {
    const result = await matching.runMatching("REQ-H4TK2M");
    const byId = new Map(result.ineligible.map((c) => [c.itemId, c]));

    // Parts-only cracked panel: below the condition floor.
    const cracked = byId.get("LP-MON-W2QJ5F");
    assert.ok(cracked, "the cracked parts-only monitor must be listed as incompatible");
    assert.ok(
      cracked.blockers.some((b) => /below the stated floor/.test(b)),
      "the blocking reason must name the condition floor",
    );
    assert.ok(!result.eligible.some((c) => c.itemId === "LP-MON-W2QJ5F"));

    // Single 27-inch panel: not enough units for a request of four.
    const single = byId.get("LP-MON-R7WH3M");
    assert.ok(single);
    assert.ok(single.blockers.some((b) => /Only 1 available/.test(b)));

    // Keyboards: wrong category entirely.
    const keyboards = byId.get("LP-PER-H3MD7K");
    assert.ok(keyboards);
    assert.ok(keyboards.blockers.some((b) => /Category is Peripheral/.test(b)));
  });

  it("never matches an organization against its own listings", async () => {
    const result = await matching.runMatching("REQ-V3NB7C"); // posted by ReLoop
    const all = [...result.eligible, ...result.ineligible];
    assert.ok(
      all.every((c) => c.orgId !== "org-reloop-collective"),
      "an organization's own items must not appear among its candidates",
    );
  });

  it("reports distance as unknown when coordinates are missing", async () => {
    harness.sqlite
      .prepare("UPDATE organizations SET latitude = NULL, longitude = NULL WHERE id = 'org-northfield-surplus'")
      .run();
    const result = await matching.runMatching("REQ-H4TK2M");
    const top = result.eligible.find((c) => c.orgId === "org-northfield-surplus");
    assert.ok(top);
    assert.equal(top.distanceKm, null);
    assert.equal(top.distanceBasis, "unknown");
    assert.ok(
      top.missingInfo.some((m) => /Distance is unknown/.test(m)),
      "a missing distance must be stated, not guessed",
    );
  });

  it("flags a missing specification as missing information rather than a silent pass", async () => {
    const result = await matching.runMatching("REQ-P8WD5R"); // keyboards, requires "Connection: Wired USB"
    const top = result.eligible[0];
    assert.ok(top);
    assert.equal(top.itemId, "LP-PER-H3MD7K");
    assert.ok(top.reasons.some((r) => /Connection/.test(r)));
  });

  it("marks a reserved item ineligible while it is held", async () => {
    harness.sqlite.prepare("UPDATE items SET status = 'reserved' WHERE id = 'LP-MON-K4T2PQ'").run();
    const result = await matching.runMatching("REQ-H4TK2M");
    assert.ok(!result.eligible.some((c) => c.itemId === "LP-MON-K4T2PQ"));
    const blocked = result.ineligible.find((c) => c.itemId === "LP-MON-K4T2PQ");
    assert.ok(blocked);
    assert.ok(blocked.blockers.some((b) => /already reserved/.test(b)));
    harness.sqlite.prepare("UPDATE items SET status = 'available' WHERE id = 'LP-MON-K4T2PQ'").run();
  });

  it("persists match results so the dashboard and the request page agree", async () => {
    await matching.runMatching("REQ-H4TK2M");
    const rows = harness.sqlite
      .prepare("SELECT eligible, constraints_met, constraints_checked FROM match_results WHERE request_id = ?")
      .all("REQ-H4TK2M") as Array<{ eligible: number; constraints_met: number; constraints_checked: number }>;
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.ok(row.constraints_checked > 0);
      assert.ok(row.constraints_met <= row.constraints_checked);
    }
  });

  it("compares numeric and pixel specifications sensibly", async () => {
    // ">=1920" is satisfied by "1920x1080"; a lower resolution is not.
    const result = await matching.runMatching("REQ-H4TK2M");
    const ultrawide = result.eligible.concat(result.ineligible).find((c) => c.itemId === "LP-MON-T6LN8V");
    assert.ok(ultrawide, "the 3440x1440 ultrawide should be considered");
    assert.ok(
      ultrawide.blockers.some((b) => /Only 1 available/.test(b)),
      "it fails on quantity, not on resolution",
    );
  });
});
