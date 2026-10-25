import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkTransition,
  availableActions,
  itemStatusForTransferState,
  TERMINAL_STATES,
  IMPACT_COUNTED_STATES,
} from "../src/lib/transfer-state";

describe("transfer state machine", () => {
  it("permits the happy path in order", () => {
    const accept = checkTransition("accept", "requested", "donor");
    assert.equal(accept.ok && accept.to, "reserved");
    const release = checkTransition("record_release", "reserved", "donor");
    assert.equal(release.ok && release.to, "released");
    const receipt = checkTransition("record_receipt", "released", "recipient");
    assert.equal(receipt.ok && receipt.to, "completed");
  });

  it("refuses an action from the wrong role", () => {
    const byRecipient = checkTransition("accept", "requested", "recipient");
    assert.equal(byRecipient.ok, false);
    const releaseByRecipient = checkTransition("record_release", "reserved", "recipient");
    assert.equal(releaseByRecipient.ok, false);
    const receiptByDonor = checkTransition("record_receipt", "released", "donor");
    assert.equal(receiptByDonor.ok, false);
  });

  it("refuses an action from the wrong state", () => {
    assert.equal(checkTransition("record_receipt", "reserved", "recipient").ok, false);
    assert.equal(checkTransition("record_release", "requested", "donor").ok, false);
    assert.equal(checkTransition("accept", "reserved", "donor").ok, false);
  });

  it("treats terminal states as terminal", () => {
    for (const state of TERMINAL_STATES) {
      if (state === "completed") {
        // Completion may still be disputed afterwards; nothing else is allowed.
        assert.deepEqual(
          availableActions(state, "recipient").map((a) => a.action),
          ["report_problem"],
        );
        continue;
      }
      assert.equal(availableActions(state, "donor").length, 0, `${state} must offer the donor nothing`);
      assert.equal(availableActions(state, "recipient").length, 0, `${state} must offer the recipient nothing`);
    }
  });

  it("allows either party to dispute from reserved, released or completed", () => {
    for (const state of ["reserved", "released", "completed"] as const) {
      assert.equal(checkTransition("report_problem", state, "donor").ok, true);
      assert.equal(checkTransition("report_problem", state, "recipient").ok, true);
    }
    assert.equal(checkTransition("report_problem", "requested", "donor").ok, false);
  });

  it("maps transfer states onto item statuses coherently", () => {
    assert.equal(itemStatusForTransferState("reserved"), "reserved");
    assert.equal(itemStatusForTransferState("released"), "reserved");
    assert.equal(itemStatusForTransferState("completed"), "transferred");
    assert.equal(itemStatusForTransferState("cancelled"), "available");
    assert.equal(itemStatusForTransferState("declined"), "available");
    // A dispute must not silently move the item anywhere.
    assert.equal(itemStatusForTransferState("disputed"), null);
    assert.equal(itemStatusForTransferState("requested"), null);
  });

  it("counts only completed transfers towards impact", () => {
    assert.deepEqual(IMPACT_COUNTED_STATES, ["completed"]);
  });
});
