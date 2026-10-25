/**
 * The transfer state machine. Defined once here, and used by the API layer,
 * the UI, and the on-chain mapping, so the three cannot drift apart.
 *
 * States
 *   requested  recipient has asked for the item; donor has not decided
 *   declined   donor turned this request down (terminal)
 *   reserved   donor accepted this request; item is held for this recipient
 *   released   donor has recorded that the item left their possession
 *   completed  both acknowledgments recorded (terminal for impact counting)
 *   cancelled  explicitly called off before completion (terminal)
 *   disputed   a party reported a problem (terminal; excluded from impact)
 */
export const TRANSFER_STATES = [
  "requested",
  "declined",
  "reserved",
  "released",
  "completed",
  "cancelled",
  "disputed",
] as const;

export type TransferState = (typeof TRANSFER_STATES)[number];

export type TransferAction =
  | "accept"
  | "decline"
  | "withdraw"
  | "cancel"
  | "record_release"
  | "record_receipt"
  | "report_problem";

export type PartyRole = "donor" | "recipient";

type Transition = {
  from: TransferState;
  to: TransferState;
  /** Which party may perform it. */
  allowedRoles: PartyRole[];
  label: string;
};

export const TRANSITIONS: Record<TransferAction, Transition[]> = {
  accept: [{ from: "requested", to: "reserved", allowedRoles: ["donor"], label: "Accept request and reserve item" }],
  decline: [{ from: "requested", to: "declined", allowedRoles: ["donor"], label: "Decline request" }],
  withdraw: [{ from: "requested", to: "cancelled", allowedRoles: ["recipient"], label: "Withdraw request" }],
  cancel: [
    { from: "reserved", to: "cancelled", allowedRoles: ["donor", "recipient"], label: "Cancel reservation" },
  ],
  record_release: [
    { from: "reserved", to: "released", allowedRoles: ["donor"], label: "Record release of item" },
  ],
  record_receipt: [
    { from: "released", to: "completed", allowedRoles: ["recipient"], label: "Record receipt and confirm condition" },
  ],
  report_problem: [
    { from: "reserved", to: "disputed", allowedRoles: ["donor", "recipient"], label: "Report a problem" },
    { from: "released", to: "disputed", allowedRoles: ["donor", "recipient"], label: "Report a problem" },
    { from: "completed", to: "disputed", allowedRoles: ["donor", "recipient"], label: "Report a problem" },
  ],
};

export const TERMINAL_STATES: TransferState[] = ["declined", "completed", "cancelled", "disputed"];

/** States in which the item is held and nobody else may reserve it. */
export const ACTIVE_RESERVATION_STATES: TransferState[] = ["reserved", "released"];

/** The only state counted as confirmed reuse. */
export const IMPACT_COUNTED_STATES: TransferState[] = ["completed"];

export type TransitionCheck =
  | { ok: true; to: TransferState; label: string }
  | { ok: false; reason: string };

export function checkTransition(
  action: TransferAction,
  from: TransferState,
  role: PartyRole,
): TransitionCheck {
  const candidates = TRANSITIONS[action];
  if (!candidates) return { ok: false, reason: `Unknown action "${action}".` };

  const forState = candidates.filter((t) => t.from === from);
  if (forState.length === 0) {
    return {
      ok: false,
      reason: `"${action}" is not permitted from state "${from}".`,
    };
  }
  const permitted = forState.find((t) => t.allowedRoles.includes(role));
  if (!permitted) {
    return {
      ok: false,
      reason: `Only the ${forState[0].allowedRoles.join(" or ")} may ${action.replace(/_/g, " ")} from "${from}".`,
    };
  }
  return { ok: true, to: permitted.to, label: permitted.label };
}

export function availableActions(from: TransferState, role: PartyRole): Array<{ action: TransferAction; to: TransferState; label: string }> {
  const out: Array<{ action: TransferAction; to: TransferState; label: string }> = [];
  for (const action of Object.keys(TRANSITIONS) as TransferAction[]) {
    for (const t of TRANSITIONS[action]) {
      if (t.from === from && t.allowedRoles.includes(role)) {
        out.push({ action, to: t.to, label: t.label });
      }
    }
  }
  return out;
}

/** Item status implied by a transfer entering `state`. */
export function itemStatusForTransferState(
  state: TransferState,
): "available" | "reserved" | "transferred" | null {
  switch (state) {
    case "reserved":
    case "released":
      return "reserved";
    case "completed":
      return "transferred";
    case "cancelled":
    case "declined":
      return "available";
    case "disputed":
      return null; // leave the item where it was; a human decides next
    case "requested":
      return null;
  }
}

export const STATE_LABELS: Record<TransferState, string> = {
  requested: "Request submitted",
  declined: "Request declined",
  reserved: "Reserved",
  released: "Released by donor",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

/**
 * Contract-side state for a given off-chain transfer state. `null` means the
 * off-chain state has no on-chain counterpart.
 */
export const CHAIN_STATE_BY_TRANSFER_STATE: Record<TransferState, number | null> = {
  requested: null, // requests are not anchored; only accepted reservations are
  declined: null,
  reserved: 2, // State.Reserved
  released: 3, // State.Released
  completed: 4, // State.Completed
  cancelled: 1, // State.Registered — item becomes available again
  disputed: 5, // State.Disputed
};
