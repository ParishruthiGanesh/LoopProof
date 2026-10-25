import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createHarness, type Harness } from "./helpers";

describe("evidence manifest and tamper detection", () => {
  let harness: Harness;
  let lib: typeof import("../src/lib/evidence-manifest");
  let items: typeof import("../src/lib/items");

  before(async () => {
    harness = await createHarness("evidence");
    lib = await import("../src/lib/evidence-manifest");
    items = await import("../src/lib/items");
  });
  after(() => harness.cleanup());

  it("canonicalises independently of key order and whitespace", () => {
    const a = lib.canonicalize({ b: 1, a: { z: true, y: [3, 2, 1] } });
    const b = lib.canonicalize({ a: { y: [3, 2, 1], z: true }, b: 1 });
    assert.equal(a, b);
    assert.equal(a, '{"a":{"y":[3,2,1],"z":true},"b":1}');
    // Array order is significant, because evidence order is significant.
    assert.notEqual(lib.canonicalize([1, 2]), lib.canonicalize([2, 1]));
  });

  it("produces a stable digest for the same manifest", async () => {
    const first = await items.buildManifest("LP-MON-K4T2PQ");
    const second = await items.buildManifest("LP-MON-K4T2PQ");
    assert.equal(lib.manifestDigest(first).sha256, lib.manifestDigest(second).sha256);
    assert.match(lib.manifestDigest(first).bytes32, /^0x[0-9a-f]{64}$/);
  });

  it("changes the digest when any covered field changes", async () => {
    const manifest = await items.buildManifest("LP-MON-K4T2PQ");
    const original = lib.manifestDigest(manifest).sha256;

    const tampered = { ...manifest, conditionGrade: "working_good", knownDefects: "none reported" };
    assert.notEqual(lib.manifestDigest(tampered).sha256, original);

    const titleChanged = { ...manifest, title: `${manifest.title} ` };
    assert.notEqual(lib.manifestDigest(titleChanged).sha256, original);

    const specChanged = {
      ...manifest,
      specifications: manifest.specifications.map((s, i) => (i === 0 ? { ...s, value: "9999x9999" } : s)),
    };
    assert.notEqual(lib.manifestDigest(specChanged).sha256, original);
  });

  it("does not change the digest when a private field changes", async () => {
    const before = lib.manifestDigest(await items.buildManifest("LP-MON-K4T2PQ")).sha256;
    harness.sqlite
      .prepare("UPDATE items SET private_notes = ?, collection_address = ? WHERE id = ?")
      .run("changed internal note", "new private bay 9", "LP-MON-K4T2PQ");
    const after = lib.manifestDigest(await items.buildManifest("LP-MON-K4T2PQ")).sha256;
    assert.equal(after, before, "private fields must not be covered by the anchored digest");
  });

  it("never includes private data in the manifest", async () => {
    const manifest = await items.buildManifest("LP-MON-K4T2PQ");
    const text = JSON.stringify(manifest);
    assert.ok(!text.includes("@"), "no email address may appear in the manifest");
    assert.ok(!text.includes("Marsden Row"), "no collection address may appear in the manifest");
    assert.ok(!text.includes("Demonstration record. Internal note"), "no private note may appear");
  });

  it("excludes unconfirmed AI suggestions from the manifest", async () => {
    const { uuid } = await import("../src/lib/ids");
    harness.sqlite
      .prepare(
        `INSERT INTO item_specs (id, item_id, label, value, source, confirmed_by_owner, basis, sort_order)
         VALUES (?, 'LP-MON-K4T2PQ', 'Refresh rate', '144 Hz', 'ai_suggested_unconfirmed', 0, 'guessed', 99)`,
      )
      .run(uuid());
    const manifest = await items.buildManifest("LP-MON-K4T2PQ");
    assert.ok(
      !manifest.specifications.some((s) => s.label === "Refresh rate"),
      "an unconfirmed suggestion must not reach the public manifest",
    );
  });

  it("reports a mismatch when evidence changes after the manifest was written", async () => {
    const clean = await items.verifyEvidence("LP-MON-R7WH3M");
    assert.equal(clean.localMatch, true);
    assert.equal(clean.anchorMatch, null, "nothing is anchored in this environment");

    harness.sqlite
      .prepare("UPDATE items SET condition_grade = 'working_good', known_defects = '' WHERE id = ?")
      .run("LP-MON-R7WH3M");

    const dirty = await items.verifyEvidence("LP-MON-R7WH3M");
    assert.equal(dirty.localMatch, false, "a changed covered field must be detected");
    assert.notEqual(dirty.recomputedSha256, dirty.storedSha256);
  });

  it("distinguishes an unreachable chain from nothing being anchored", async () => {
    const result = await items.verifyEvidence("LP-MON-K4T2PQ");
    // No contract is configured in the test environment, which is a different
    // thing again from "we tried and could not reach it".
    assert.equal(result.anchorReadStatus, "not_configured");
    assert.equal(result.anchorMatch, null);
    assert.equal(result.anchorReadError, null);

    const chain = await import("../src/lib/chain");
    const read = await chain.readOnChainItemResult(`0x${"ab".repeat(32)}`);
    assert.equal(read.status, "not_configured");
  });

  it("keeps earlier manifest versions when a listing changes", async () => {
    const before = harness.sqlite
      .prepare("SELECT COUNT(*) AS n FROM evidence_manifests WHERE item_id = ?")
      .get("LP-MON-B9XC4D") as { n: number };

    harness.sqlite.prepare("UPDATE items SET description = ? WHERE id = ?").run("Revised description.", "LP-MON-B9XC4D");
    const snapshot = await items.snapshotManifest("LP-MON-B9XC4D");
    assert.equal(snapshot.changed, true);
    assert.equal(snapshot.versionNumber, before.n + 1);

    const after = harness.sqlite
      .prepare("SELECT COUNT(*) AS n FROM evidence_manifests WHERE item_id = ?")
      .get("LP-MON-B9XC4D") as { n: number };
    assert.equal(after.n, before.n + 1, "the earlier version must be preserved, not overwritten");

    // Re-snapshotting unchanged evidence must not create a new version.
    const again = await items.snapshotManifest("LP-MON-B9XC4D");
    assert.equal(again.changed, false);
    assert.equal(again.versionNumber, snapshot.versionNumber);
  });
});
