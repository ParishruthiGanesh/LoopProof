import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createHarness, sessionFor, ORGS, type Harness } from "./helpers";

/**
 * Backend workflow checks: organization permissions, duplicate requests,
 * conflicting reservations, and the two-party completion requirement.
 *
 * These call the service layer directly, which is the same code path the API
 * routes use, so a permission that is only enforced in the interface would
 * fail here.
 */
describe("transfer workflow and permissions", () => {
  let harness: Harness;
  let transfers: typeof import("../src/lib/transfers");
  let auth: typeof import("../src/lib/auth");

  const ITEM = "LP-MON-T6LN8V"; // available ultrawide, quantity 1, owned by the donor org

  before(async () => {
    harness = await createHarness("workflow");
    transfers = await import("../src/lib/transfers");
    auth = await import("../src/lib/auth");
  });
  after(() => harness.cleanup());

  it("refuses a request for an organization's own listing", () => {
    assert.throws(
      () =>
        transfers.submitRequest({
          itemId: ITEM,
          recipientOrgId: ORGS.donor,
          message: "our own item",
          quantity: 1,
        }),
      auth.ForbiddenError,
    );
  });

  it("refuses a request for more units than are offered", () => {
    assert.throws(
      () =>
        transfers.submitRequest({
          itemId: ITEM,
          recipientOrgId: ORGS.recipient,
          message: "we would like five",
          quantity: 5,
        }),
      /Only 1 available/,
    );
  });

  it("accepts a request and refuses a duplicate from the same organization", () => {
    const first = transfers.submitRequest({
      itemId: ITEM,
      recipientOrgId: ORGS.recipient,
      message: "We need one ultrawide for the tutor station.",
      quantity: 1,
    });
    assert.match(first.transferId, /^TRN-/);

    assert.throws(
      () =>
        transfers.submitRequest({
          itemId: ITEM,
          recipientOrgId: ORGS.recipient,
          message: "asking again",
          quantity: 1,
        }),
      /already has an open request/,
    );
  });

  it("allows a second organization to request the same available item", () => {
    const second = transfers.submitRequest({
      itemId: ITEM,
      recipientOrgId: ORGS.other,
      message: "We could also use it in the workshop.",
      quantity: 1,
    });
    assert.match(second.transferId, /^TRN-/);
    const open = harness.sqlite
      .prepare("SELECT COUNT(*) AS n FROM transfers WHERE item_id = ? AND state = 'requested'")
      .get(ITEM) as { n: number };
    assert.equal(open.n, 2);
  });

  it("refuses an action from an organization that is not a party", async () => {
    const transferId = (
      harness.sqlite
        .prepare("SELECT id FROM transfers WHERE item_id = ? AND recipient_org_id = ?")
        .get(ITEM, ORGS.recipient) as { id: string }
    ).id;

    await assert.rejects(
      () =>
        transfers.applyTransferAction({
          transferId,
          action: "accept",
          user: sessionFor(harness.sqlite, ORGS.other),
        }),
      auth.ForbiddenError,
    );
  });

  it("refuses the recipient's attempt to accept their own request", async () => {
    const transferId = (
      harness.sqlite
        .prepare("SELECT id FROM transfers WHERE item_id = ? AND recipient_org_id = ?")
        .get(ITEM, ORGS.recipient) as { id: string }
    ).id;

    await assert.rejects(
      () =>
        transfers.applyTransferAction({
          transferId,
          action: "accept",
          user: sessionFor(harness.sqlite, ORGS.recipient),
        }),
      /Only the donor may accept/,
    );
  });

  it("reserves on acceptance, declines the other request, and blocks a second reservation", async () => {
    const mine = (
      harness.sqlite
        .prepare("SELECT id FROM transfers WHERE item_id = ? AND recipient_org_id = ?")
        .get(ITEM, ORGS.recipient) as { id: string }
    ).id;
    const theirs = (
      harness.sqlite
        .prepare("SELECT id FROM transfers WHERE item_id = ? AND recipient_org_id = ?")
        .get(ITEM, ORGS.other) as { id: string }
    ).id;

    const outcome = await transfers.applyTransferAction({
      transferId: mine,
      action: "accept",
      user: sessionFor(harness.sqlite, ORGS.donor),
      note: "Reserved for the classroom.",
    });
    assert.equal(outcome.toState, "reserved");
    assert.deepEqual(outcome.supersededTransferIds, [theirs]);

    const item = harness.sqlite.prepare("SELECT status FROM items WHERE id = ?").get(ITEM) as { status: string };
    assert.equal(item.status, "reserved");

    const other = harness.sqlite.prepare("SELECT state FROM transfers WHERE id = ?").get(theirs) as {
      state: string;
    };
    assert.equal(other.state, "declined", "the competing request must be visibly declined");

    // A fresh request cannot be submitted while the item is reserved.
    assert.throws(
      () =>
        transfers.submitRequest({
          itemId: ITEM,
          recipientOrgId: ORGS.other,
          message: "trying again while reserved",
          quantity: 1,
        }),
      /just been reserved|not available/,
    );
  });

  it("refuses receipt before the donor records release", async () => {
    const mine = (
      harness.sqlite
        .prepare("SELECT id FROM transfers WHERE item_id = ? AND recipient_org_id = ?")
        .get(ITEM, ORGS.recipient) as { id: string }
    ).id;

    await assert.rejects(
      () =>
        transfers.applyTransferAction({
          transferId: mine,
          action: "record_receipt",
          user: sessionFor(harness.sqlite, ORGS.recipient),
          conditionConfirmed: true,
        }),
      /not permitted from state "reserved"/,
    );

    const row = harness.sqlite.prepare("SELECT state FROM transfers WHERE id = ?").get(mine) as { state: string };
    assert.equal(row.state, "reserved");
  });

  it("completes only after both acknowledgments, and records recipient-confirmed evidence", async () => {
    const mine = (
      harness.sqlite
        .prepare("SELECT id FROM transfers WHERE item_id = ? AND recipient_org_id = ?")
        .get(ITEM, ORGS.recipient) as { id: string }
    ).id;

    await transfers.applyTransferAction({
      transferId: mine,
      action: "record_release",
      user: sessionFor(harness.sqlite, ORGS.donor),
      note: "Collected from the loading bay.",
    });

    let row = harness.sqlite
      .prepare("SELECT state, donor_release_ack, recipient_receipt_ack FROM transfers WHERE id = ?")
      .get(mine) as { state: string; donor_release_ack: number; recipient_receipt_ack: number };
    assert.equal(row.state, "released");
    assert.equal(row.donor_release_ack, 1);
    assert.equal(row.recipient_receipt_ack, 0, "release alone must not complete the transfer");

    await transfers.applyTransferAction({
      transferId: mine,
      action: "record_receipt",
      user: sessionFor(harness.sqlite, ORGS.recipient),
      conditionConfirmed: true,
      note: "Arrived as described.",
    });

    row = harness.sqlite
      .prepare("SELECT state, donor_release_ack, recipient_receipt_ack FROM transfers WHERE id = ?")
      .get(mine) as { state: string; donor_release_ack: number; recipient_receipt_ack: number };
    assert.equal(row.state, "completed");
    assert.equal(row.donor_release_ack, 1);
    assert.equal(row.recipient_receipt_ack, 1);

    const item = harness.sqlite.prepare("SELECT status FROM items WHERE id = ?").get(ITEM) as { status: string };
    assert.equal(item.status, "transferred");

    const evidence = harness.sqlite
      .prepare("SELECT COUNT(*) AS n FROM condition_evidence WHERE item_id = ? AND source = 'recipient_confirmed'")
      .get(ITEM) as { n: number };
    assert.equal(evidence.n, 1, "the recipient's confirmation must become recipient-confirmed evidence");
  });

  it("refuses to complete the same transfer twice", async () => {
    const mine = (
      harness.sqlite
        .prepare("SELECT id FROM transfers WHERE item_id = ? AND recipient_org_id = ?")
        .get(ITEM, ORGS.recipient) as { id: string }
    ).id;

    await assert.rejects(
      () =>
        transfers.applyTransferAction({
          transferId: mine,
          action: "record_receipt",
          user: sessionFor(harness.sqlite, ORGS.recipient),
          conditionConfirmed: true,
        }),
      /not permitted from state "completed"/,
    );
  });

  it("refuses receipt while re-acknowledgment is required and the recipient has not confirmed", async () => {
    const item = "LP-NET-C4VB6G";
    const { transferId } = transfers.submitRequest({
      itemId: item,
      recipientOrgId: ORGS.recipient,
      message: "One switch for the classroom network.",
      quantity: 1,
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

    // The donor edits public evidence after the reservation was granted.
    harness.sqlite
      .prepare("UPDATE items SET known_defects = 'One port now reported faulty.' WHERE id = ?")
      .run(item);
    const items = await import("../src/lib/items");
    const snapshot = await items.snapshotManifest(item);
    await items.flagTransfersForReacknowledgement(item, snapshot.versionNumber);

    await assert.rejects(
      () =>
        transfers.applyTransferAction({
          transferId,
          action: "record_receipt",
          user: sessionFor(harness.sqlite, ORGS.recipient),
          conditionConfirmed: false,
        }),
      /public evidence for this item changed/,
    );

    // With an explicit fresh confirmation it proceeds.
    const outcome = await transfers.applyTransferAction({
      transferId,
      action: "record_receipt",
      user: sessionFor(harness.sqlite, ORGS.recipient),
      conditionConfirmed: true,
    });
    assert.equal(outcome.toState, "completed");
  });

  it("returns a cancelled item to the marketplace and keeps the cancellation on the record", async () => {
    const item = "LP-PER-H3MD7K";
    const { transferId } = transfers.submitRequest({
      itemId: item,
      recipientOrgId: ORGS.recipient,
      message: "Four keyboard and mouse sets.",
      quantity: 4,
    });
    await transfers.applyTransferAction({
      transferId,
      action: "accept",
      user: sessionFor(harness.sqlite, ORGS.donor),
    });
    await transfers.applyTransferAction({
      transferId,
      action: "cancel",
      user: sessionFor(harness.sqlite, ORGS.recipient),
      note: "Van unavailable.",
    });

    const row = harness.sqlite.prepare("SELECT state, cancel_reason FROM transfers WHERE id = ?").get(transferId) as {
      state: string;
      cancel_reason: string;
    };
    assert.equal(row.state, "cancelled");
    assert.equal(row.cancel_reason, "Van unavailable.");

    const itemRow = harness.sqlite.prepare("SELECT status FROM items WHERE id = ?").get(item) as { status: string };
    assert.equal(itemRow.status, "available");

    const events = harness.sqlite
      .prepare("SELECT COUNT(*) AS n FROM transfer_events WHERE transfer_id = ?")
      .get(transferId) as { n: number };
    assert.ok(events.n >= 3, "the timeline must retain every step, including the cancellation");
  });

  it("records a dispute without erasing the acknowledgments that preceded it", async () => {
    const item = "LP-ELE-N8KF2S";
    const { transferId } = transfers.submitRequest({
      itemId: item,
      recipientOrgId: ORGS.recipient,
      message: "Two desktops for the classroom.",
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
      action: "report_problem",
      user: sessionFor(harness.sqlite, ORGS.recipient),
      note: "Only one of the two machines arrived.",
    });

    const row = harness.sqlite
      .prepare("SELECT state, donor_release_ack, dispute_reason, dispute_raised_by_org_id FROM transfers WHERE id = ?")
      .get(transferId) as {
      state: string;
      donor_release_ack: number;
      dispute_reason: string;
      dispute_raised_by_org_id: string;
    };
    assert.equal(row.state, "disputed");
    assert.equal(row.donor_release_ack, 1, "the donor's earlier acknowledgment must survive the dispute");
    assert.match(row.dispute_reason, /Only one of the two machines/);
    assert.equal(row.dispute_raised_by_org_id, ORGS.recipient);
  });

  it("refuses to store a completed transfer that is missing an acknowledgment", () => {
    // The database itself must refuse this, not only the application code.
    assert.throws(
      () =>
        harness.sqlite
          .prepare(
            `INSERT INTO transfers (id, item_id, donor_org_id, recipient_org_id, state,
               donor_release_ack, recipient_receipt_ack)
             VALUES ('TRN-BOGUS', ?, ?, ?, 'completed', 1, 0)`,
          )
          .run("LP-MON-K4T2PQ", ORGS.donor, ORGS.recipient),
      /CHECK constraint failed/,
    );
    assert.throws(
      () =>
        harness.sqlite
          .prepare(
            `INSERT INTO transfers (id, item_id, donor_org_id, recipient_org_id, state,
               donor_release_ack, recipient_receipt_ack)
             VALUES ('TRN-BOGUS2', ?, ?, ?, 'completed', 0, 1)`,
          )
          .run("LP-MON-K4T2PQ", ORGS.donor, ORGS.recipient),
      /CHECK constraint failed/,
    );
  });

  it("degrades honestly when no blockchain RPC is configured", async () => {
    const rows = harness.sqlite
      .prepare("SELECT status, error_message FROM chain_transactions ORDER BY created_at")
      .all() as Array<{ status: string; error_message: string }>;
    assert.ok(rows.length > 0, "anchoring attempts must still be recorded");
    for (const row of rows) {
      assert.notEqual(row.status, "confirmed", "nothing may be marked confirmed without a receipt");
      assert.notEqual(row.status, "simulated", "simulation must stay off unless explicitly enabled");
      assert.equal(row.status, "not_anchored");
      assert.match(row.error_message, /No contract address configured/);
    }
  });
});
