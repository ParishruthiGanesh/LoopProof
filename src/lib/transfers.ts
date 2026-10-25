import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb, getSqlite, schema } from "./db";
import { newTransferId, uuid } from "./ids";
import {
  ACTIVE_RESERVATION_STATES,
  availableActions,
  checkTransition,
  itemStatusForTransferState,
  type PartyRole,
  type TransferAction,
  type TransferState,
} from "./transfer-state";
import { anchor, type AnchorResult } from "./chain";
import { itemIdToBytes32, sha256Hex } from "./evidence-manifest";
import { ForbiddenError, type SessionUser } from "./auth";

export class WorkflowError extends Error {
  status = 409;
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export type TransferRecord = typeof schema.transfers.$inferSelect;

/* --------------------------------------------------------------- requesting */

/**
 * Recipient submits a request for an item.
 *
 * Runs inside an IMMEDIATE transaction and re-checks item availability inside
 * it, so two simultaneous submissions cannot both succeed against an item that
 * has already been reserved. The partial unique index
 * transfers_open_request_unique additionally refuses a duplicate open request
 * from the same organization at the database level.
 */
export function submitRequest(input: {
  itemId: string;
  recipientOrgId: string;
  requestId?: string | null;
  message: string;
  quantity: number;
}): { transferId: string } {
  const sqlite = getSqlite();
  const transferId = newTransferId();
  const now = new Date().toISOString();

  const run = sqlite.transaction(() => {
    const item = sqlite
      .prepare("SELECT id, org_id, status, quantity, is_demo FROM items WHERE id = ?")
      .get(input.itemId) as
      | { id: string; org_id: string; status: string; quantity: number; is_demo: number }
      | undefined;

    if (!item) throw new WorkflowError("That listing no longer exists.");
    if (item.org_id === input.recipientOrgId) {
      throw new ForbiddenError("You cannot request your own organization's listing.");
    }
    if (item.status !== "available") {
      throw new WorkflowError(
        item.status === "reserved"
          ? "This item has just been reserved for another organization."
          : `This item is not available (status: ${item.status}).`,
      );
    }
    if (input.quantity > item.quantity) {
      throw new WorkflowError(`Only ${item.quantity} available.`);
    }

    const duplicate = sqlite
      .prepare(
        "SELECT id FROM transfers WHERE item_id = ? AND recipient_org_id = ? AND state IN ('requested','reserved','released')",
      )
      .get(input.itemId, input.recipientOrgId) as { id: string } | undefined;
    if (duplicate) {
      throw new WorkflowError("Your organization already has an open request for this item.");
    }

    sqlite
      .prepare(
        `INSERT INTO transfers (id, item_id, request_id, donor_org_id, recipient_org_id, state,
           request_message, quantity, created_at, updated_at, is_demo)
         VALUES (?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?, 0)`,
      )
      .run(
        transferId,
        input.itemId,
        input.requestId ?? null,
        item.org_id,
        input.recipientOrgId,
        input.message.slice(0, 1000),
        input.quantity,
        now,
        now,
      );

    sqlite
      .prepare(
        `INSERT INTO transfer_events (id, transfer_id, kind, from_state, to_state, actor_org_id, note, is_public, created_at)
         VALUES (?, ?, 'request_submitted', NULL, 'requested', ?, ?, 1, ?)`,
      )
      .run(uuid(), transferId, input.recipientOrgId, "Recipient submitted a request for this item.", now);
  });

  run.immediate();
  return { transferId };
}

/* ---------------------------------------------------------- state changes */

export type ActionOutcome = {
  transfer: TransferRecord;
  fromState: TransferState;
  toState: TransferState;
  anchorResult: AnchorResult | null;
  /** Other requests auto-declined because this one was accepted. */
  supersededTransferIds: string[];
};

/**
 * Applies one transfer action. Permissions and the transition table are both
 * checked on the server; the client never says what state to move to.
 */
export async function applyTransferAction(input: {
  transferId: string;
  action: TransferAction;
  user: SessionUser;
  note?: string;
  /** Recipient confirming receipt must also say whether condition was as described. */
  conditionConfirmed?: boolean;
}): Promise<ActionOutcome> {
  const sqlite = getSqlite();
  const db = getDb();
  const now = new Date().toISOString();

  // Phase 1: the authoritative state change, in one write transaction.
  let fromState!: TransferState;
  let toState!: TransferState;
  let superseded: string[] = [];
  let itemId!: string;
  let recipientOrgId!: string;
  let donorOrgId!: string;
  let evidenceVersion!: number;

  const run = sqlite.transaction(() => {
    const row = sqlite.prepare("SELECT * FROM transfers WHERE id = ?").get(input.transferId) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new WorkflowError("That transfer no longer exists.");

    donorOrgId = row.donor_org_id as string;
    recipientOrgId = row.recipient_org_id as string;
    itemId = row.item_id as string;
    fromState = row.state as TransferState;

    const role: PartyRole | null =
      input.user.orgId === donorOrgId ? "donor" : input.user.orgId === recipientOrgId ? "recipient" : null;
    if (!role) throw new ForbiddenError("Only the donor and the recipient may act on this transfer.");

    const check = checkTransition(input.action, fromState, role);
    if (!check.ok) throw new WorkflowError(check.reason);
    toState = check.to;

    if (
      input.action === "record_receipt" &&
      (row.requires_reacknowledgement as number) === 1 &&
      input.conditionConfirmed !== true
    ) {
      throw new WorkflowError(
        "The public evidence for this item changed after you were given the reservation. Review the revised evidence and confirm it before recording receipt.",
      );
    }

    const item = sqlite.prepare("SELECT status, evidence_version FROM items WHERE id = ?").get(itemId) as
      | { status: string; evidence_version: number }
      | undefined;
    if (!item) throw new WorkflowError("The item for this transfer no longer exists.");
    evidenceVersion = item.evidence_version;

    // Accepting a request must not be possible if the item got reserved in the
    // meantime. The partial unique index is the real guard; this gives a
    // readable error instead of a constraint violation.
    if (input.action === "accept") {
      const active = sqlite
        .prepare(
          "SELECT id FROM transfers WHERE item_id = ? AND id <> ? AND state IN ('reserved','released')",
        )
        .get(itemId, input.transferId) as { id: string } | undefined;
      if (active) {
        throw new WorkflowError(
          "This item is already reserved for another organization. Cancel that reservation first.",
        );
      }
      if (item.status !== "available") {
        throw new WorkflowError(`This item is not available to reserve (status: ${item.status}).`);
      }
    }

    const patch: Record<string, unknown> = { state: toState, updated_at: now };
    if (input.action === "accept") {
      patch.reserved_at = now;
      patch.evidence_version_at_reservation = evidenceVersion;
      patch.requires_reacknowledgement = 0;
    }
    if (input.action === "record_release") {
      patch.donor_release_ack = 1;
      patch.released_at = now;
    }
    if (input.action === "record_receipt") {
      patch.recipient_receipt_ack = 1;
      patch.received_at = now;
      patch.completed_at = now;
      patch.requires_reacknowledgement = 0;
    }
    if (toState === "cancelled" || toState === "declined") {
      patch.closed_at = now;
      patch.cancel_reason = (input.note ?? "").slice(0, 500);
    }
    if (toState === "disputed") {
      patch.dispute_reason = (input.note ?? "").slice(0, 500);
      patch.dispute_raised_by_org_id = input.user.orgId;
      patch.closed_at = now;
    }

    const assignments = Object.keys(patch).map((k) => `${k} = ?`).join(", ");
    sqlite
      .prepare(`UPDATE transfers SET ${assignments} WHERE id = ?`)
      .run(...Object.values(patch), input.transferId);

    sqlite
      .prepare(
        `INSERT INTO transfer_events (id, transfer_id, kind, from_state, to_state, actor_org_id, note, is_public, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(
        uuid(),
        input.transferId,
        input.action,
        fromState,
        toState,
        input.user.orgId,
        (input.note ?? "").slice(0, 500),
        now,
      );

    // Item status follows the transfer state.
    const nextItemStatus = itemStatusForTransferState(toState);
    if (nextItemStatus) {
      sqlite
        .prepare("UPDATE items SET status = ?, updated_at = ? WHERE id = ?")
        .run(nextItemStatus, now, itemId);
    }

    // Accepting one request declines the others, visibly.
    if (input.action === "accept") {
      const others = sqlite
        .prepare("SELECT id FROM transfers WHERE item_id = ? AND id <> ? AND state = 'requested'")
        .all(itemId, input.transferId) as { id: string }[];
      superseded = others.map((o) => o.id);
      for (const other of others) {
        sqlite
          .prepare(
            "UPDATE transfers SET state = 'declined', closed_at = ?, updated_at = ?, cancel_reason = ? WHERE id = ?",
          )
          .run(now, now, "The donor reserved this item for another recipient.", other.id);
        sqlite
          .prepare(
            `INSERT INTO transfer_events (id, transfer_id, kind, from_state, to_state, actor_org_id, note, is_public, created_at)
             VALUES (?, ?, 'superseded', 'requested', 'declined', ?, ?, 1, ?)`,
          )
          .run(
            uuid(),
            other.id,
            donorOrgId,
            "The donor reserved this item for a different recipient.",
            now,
          );
      }
    }

    // Recipient's receipt confirmation becomes recipient-confirmed evidence.
    if (input.action === "record_receipt" && input.conditionConfirmed) {
      sqlite
        .prepare(
          `INSERT INTO condition_evidence (id, item_id, kind, source, statement, recorded_by_org_id, is_public, recorded_at)
           VALUES (?, ?, 'recipient_confirmation', 'recipient_confirmed', ?, ?, 1, ?)`,
        )
        .run(
          uuid(),
          itemId,
          `Recipient confirmed on receipt that the item matched the published condition${(input.note ?? "").trim() ? `: ${(input.note ?? "").trim().slice(0, 300)}` : "."}`,
          input.user.orgId,
          now,
        );
    }
    if (toState === "disputed") {
      sqlite
        .prepare(
          `INSERT INTO condition_evidence (id, item_id, kind, source, statement, recorded_by_org_id, is_public, recorded_at)
           VALUES (?, ?, 'defect_report', 'recipient_confirmed', ?, ?, 1, ?)`,
        )
        .run(
          uuid(),
          itemId,
          `Problem reported during transfer: ${(input.note ?? "no detail given").slice(0, 300)}`,
          input.user.orgId,
          now,
        );
    }

    // Fulfilled requests close when their transfer completes.
    if (toState === "completed" && row.request_id) {
      sqlite.prepare("UPDATE requests SET status = 'fulfilled' WHERE id = ?").run(row.request_id as string);
    }
  });

  run.immediate();

  // Phase 2: anchor the state change. A chain failure never rolls back the
  // acknowledgment that the parties actually made; it is recorded as failed and
  // can be retried with the same idempotency key.
  const anchorResult = await anchorTransferState({
    action: input.action,
    transferId: input.transferId,
    itemId,
    donorOrgId,
    recipientOrgId,
    actorOrgId: input.user.orgId,
    note: input.note ?? "",
  });

  const transfer = (
    await db.select().from(schema.transfers).where(eq(schema.transfers.id, input.transferId)).limit(1)
  )[0];

  return { transfer, fromState, toState, anchorResult, supersededTransferIds: superseded };
}

async function anchorTransferState(input: {
  action: TransferAction;
  transferId: string;
  itemId: string;
  donorOrgId: string;
  recipientOrgId: string;
  actorOrgId: string;
  note: string;
}): Promise<AnchorResult | null> {
  const db = getDb();
  const itemKey = itemIdToBytes32(input.itemId);

  const recipientOrg = (
    await db
      .select({ wallet: schema.organizations.walletAddress })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, input.recipientOrgId))
      .limit(1)
  )[0];

  switch (input.action) {
    case "accept": {
      if (!recipientOrg?.wallet) return null;
      return anchor({
        action: "reserve_item",
        idempotencyKey: `reserve_item:${input.transferId}`,
        itemId: input.itemId,
        itemKey,
        transferId: input.transferId,
        actingOrgId: input.donorOrgId,
        args: [itemKey, recipientOrg.wallet],
        payload: { recipient: recipientOrg.wallet },
      });
    }
    case "record_release":
      return anchor({
        action: "acknowledge_release",
        idempotencyKey: `acknowledge_release:${input.transferId}`,
        itemId: input.itemId,
        itemKey,
        transferId: input.transferId,
        actingOrgId: input.donorOrgId,
        args: [itemKey],
      });
    case "record_receipt":
      return anchor({
        action: "acknowledge_receipt",
        idempotencyKey: `acknowledge_receipt:${input.transferId}`,
        itemId: input.itemId,
        itemKey,
        transferId: input.transferId,
        actingOrgId: input.recipientOrgId,
        args: [itemKey],
      });
    case "cancel":
      return anchor({
        action: "cancel_reservation",
        idempotencyKey: `cancel_reservation:${input.transferId}`,
        itemId: input.itemId,
        itemKey,
        transferId: input.transferId,
        actingOrgId: input.actorOrgId,
        args: [itemKey, input.note.slice(0, 200) || "cancelled by a party"],
      });
    case "report_problem":
      return anchor({
        action: "raise_dispute",
        idempotencyKey: `raise_dispute:${input.transferId}`,
        itemId: input.itemId,
        itemKey,
        transferId: input.transferId,
        actingOrgId: input.actorOrgId,
        args: [itemKey, `0x${sha256Hex(input.note || "problem reported")}`],
        payload: { reasonDigestOf: "the dispute note; the note itself stays off-chain" },
      });
    // Requests and declines are not anchored: nothing was agreed yet.
    case "decline":
    case "withdraw":
      return null;
  }
}

/* ------------------------------------------------------------------ views */

export type TimelineEntry = {
  id: string;
  kind: string;
  fromState: string | null;
  toState: string | null;
  actorOrgName: string | null;
  note: string;
  createdAt: string;
};

export type TransferView = {
  transfer: TransferRecord;
  itemTitle: string;
  itemStatus: string;
  donorOrgName: string;
  recipientOrgName: string;
  timeline: TimelineEntry[];
  chainRows: Array<typeof schema.chainTransactions.$inferSelect>;
  role: PartyRole | "public";
  actions: Array<{ action: TransferAction; to: TransferState; label: string }>;
};

export async function loadTransferView(
  transferId: string,
  viewerOrgId: string | null,
): Promise<TransferView | null> {
  const db = getDb();
  const rows = await db
    .select({ transfer: schema.transfers, itemTitle: schema.items.title, itemStatus: schema.items.status })
    .from(schema.transfers)
    .innerJoin(schema.items, eq(schema.items.id, schema.transfers.itemId))
    .where(eq(schema.transfers.id, transferId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const orgs = await db.select().from(schema.organizations);
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? null;

  const events = await db
    .select()
    .from(schema.transferEvents)
    .where(eq(schema.transferEvents.transferId, transferId))
    .orderBy(asc(schema.transferEvents.createdAt), asc(schema.transferEvents.id));

  const chainRows = await db
    .select()
    .from(schema.chainTransactions)
    .where(eq(schema.chainTransactions.transferId, transferId))
    .orderBy(asc(schema.chainTransactions.createdAt));

  const role: PartyRole | "public" =
    viewerOrgId === row.transfer.donorOrgId
      ? "donor"
      : viewerOrgId === row.transfer.recipientOrgId
        ? "recipient"
        : "public";

  return {
    transfer: row.transfer,
    itemTitle: row.itemTitle,
    itemStatus: row.itemStatus,
    donorOrgName: orgName(row.transfer.donorOrgId) ?? "Unknown organization",
    recipientOrgName: orgName(row.transfer.recipientOrgId) ?? "Unknown organization",
    timeline: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      fromState: e.fromState,
      toState: e.toState,
      actorOrgName: orgName(e.actorOrgId),
      note: e.note,
      createdAt: e.createdAt,
    })),
    chainRows,
    role,
    actions: role === "public" ? [] : availableActions(row.transfer.state, role),
  };
}

export async function listTransfersForOrg(orgId: string) {
  const db = getDb();
  return db
    .select({
      transfer: schema.transfers,
      itemTitle: schema.items.title,
      itemId: schema.items.id,
    })
    .from(schema.transfers)
    .innerJoin(schema.items, eq(schema.items.id, schema.transfers.itemId))
    .where(
      and(
        ne(schema.transfers.state, "declined"),
        inArray(schema.transfers.donorOrgId, [orgId]),
      ),
    )
    .orderBy(desc(schema.transfers.updatedAt));
}

/** Public transfer history for an item's passport. */
export async function publicTransferHistory(itemId: string) {
  const db = getDb();
  const transfers = await db
    .select()
    .from(schema.transfers)
    .where(and(eq(schema.transfers.itemId, itemId), ne(schema.transfers.state, "requested")))
    .orderBy(asc(schema.transfers.createdAt));

  const orgs = await db.select().from(schema.organizations);
  const name = (id: string) => orgs.find((o) => o.id === id)?.name ?? "Unknown organization";

  const out = [];
  for (const transfer of transfers) {
    const events = await db
      .select()
      .from(schema.transferEvents)
      .where(and(eq(schema.transferEvents.transferId, transfer.id), eq(schema.transferEvents.isPublic, true)))
      .orderBy(asc(schema.transferEvents.createdAt), asc(schema.transferEvents.id));
    const chainRows = await db
      .select()
      .from(schema.chainTransactions)
      .where(eq(schema.chainTransactions.transferId, transfer.id))
      .orderBy(asc(schema.chainTransactions.createdAt));
    out.push({
      transfer,
      donorOrgName: name(transfer.donorOrgId),
      recipientOrgName: name(transfer.recipientOrgId),
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        fromState: e.fromState,
        toState: e.toState,
        actorOrgName: e.actorOrgId ? name(e.actorOrgId) : null,
        note: e.note,
        createdAt: e.createdAt,
      })),
      chainRows,
    });
  }
  return out;
}

export { ACTIVE_RESERVATION_STATES };
