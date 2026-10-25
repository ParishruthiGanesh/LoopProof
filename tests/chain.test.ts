import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createHarness, type Harness } from "./helpers";

/**
 * Anchoring behaviour with no chain configured, and the staleness rule that
 * stops a confirmed row from outliving the deployment it belongs to.
 */
describe("anchoring", () => {
  let harness: Harness;
  let chain: typeof import("../src/lib/chain");
  let ids: typeof import("../src/lib/ids");

  before(async () => {
    harness = await createHarness("chain");
    chain = await import("../src/lib/chain");
    ids = await import("../src/lib/ids");
  });
  after(() => harness.cleanup());

  it("reports honestly when no contract is configured", async () => {
    const result = await chain.anchor({
      action: "register_item",
      idempotencyKey: "test:no-contract",
      itemId: "LP-MON-K4T2PQ",
      itemKey: `0x${"11".repeat(32)}`,
      actingOrgId: "org-northfield-surplus",
      args: [],
    });
    assert.equal(result.status, "not_anchored");
    assert.notEqual(result.status, "confirmed");
    assert.match(result.error ?? "", /No contract address configured/);
  });

  it("never labels anything simulated unless simulation mode is switched on", async () => {
    const rows = harness.sqlite.prepare("SELECT status FROM chain_transactions").all() as Array<{
      status: string;
    }>;
    assert.ok(rows.every((r) => r.status !== "simulated"));
  });

  it("treats a confirmed row from another deployment as stale rather than reusing it", async () => {
    // A row left behind by an earlier chain: confirmed, with a transaction hash
    // and a contract address that is not the one configured now.
    const id = ids.uuid();
    const idempotencyKey = "test:stale-deployment";
    harness.sqlite
      .prepare(
        `INSERT INTO chain_transactions
           (id, idempotency_key, item_id, action, status, chain_id, contract_address, tx_hash, block_number, payload)
         VALUES (?, ?, 'LP-MON-K4T2PQ', 'register_item', 'confirmed', 31337,
                 '0x1111111111111111111111111111111111111111', ?, 7, '{}')`,
      )
      .run(id, idempotencyKey, `0x${"ab".repeat(32)}`);

    const result = await chain.anchor({
      action: "register_item",
      idempotencyKey,
      itemId: "LP-MON-K4T2PQ",
      itemKey: `0x${"11".repeat(32)}`,
      actingOrgId: "org-northfield-surplus",
      args: [],
    });

    assert.equal(result.deduplicated, false, "a stale confirmation must not be reused");
    assert.notEqual(result.status, "confirmed", "it must not keep claiming confirmation");

    const row = harness.sqlite
      .prepare("SELECT status, tx_hash FROM chain_transactions WHERE id = ?")
      .get(id) as { status: string; tx_hash: string | null };
    assert.notEqual(row.status, "confirmed");
    assert.equal(row.tx_hash, null, "the stale transaction hash must be cleared");
  });

  it("keeps one row per idempotency key rather than accumulating attempts", async () => {
    const rows = harness.sqlite
      .prepare("SELECT COUNT(*) AS n FROM chain_transactions WHERE idempotency_key = ?")
      .get("test:stale-deployment") as { n: number };
    assert.equal(rows.n, 1);
  });

  it("reports the chain as unconfigured rather than unreachable when there is no address", async () => {
    const health = await chain.rpcHealth();
    assert.equal(health.configured, false);
    assert.equal(health.contractAddress, null);
    assert.equal(health.simulationMode, false);
  });
});
