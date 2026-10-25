import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index, real } from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ people */

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["donor", "recipient", "both"] }).notNull(),
  description: text("description").notNull().default(""),
  /** Coarse region shown publicly, e.g. "North Harbor, Eastside". */
  locationRegion: text("location_region").notNull().default(""),
  /** Rough coordinates of the region centroid; null when unknown. */
  latitude: real("latitude"),
  longitude: real("longitude"),
  /** Private: never served on public routes. */
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  streetAddress: text("street_address").notNull().default(""),
  /** Development wallet controlled by the demo environment. Public info. */
  walletAddress: text("wallet_address"),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    /** scrypt hash, format: scrypt$<saltHex>$<keyHex> */
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["staff", "admin"] }).notNull().default("staff"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------- items */

export const items = sqliteTable(
  "items",
  {
    /** Stable, human-readable public id, e.g. LP-MON-0007. */
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    title: text("title").notNull(),
    category: text("category", {
      enum: ["monitor", "peripheral", "small_electronics", "networking", "furniture", "other"],
    }).notNull(),
    description: text("description").notNull().default(""),
    brand: text("brand").notNull().default("unknown"),
    model: text("model").notNull().default("unknown"),
    conditionGrade: text("condition_grade", {
      enum: ["working_good", "working_marks", "working_defects", "untested", "parts_only"],
    }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    /** Mass in kg; basis says whether anyone actually weighed it. */
    massKg: real("mass_kg"),
    massBasis: text("mass_basis", { enum: ["measured", "estimated", "unknown"] })
      .notNull()
      .default("unknown"),
    /** Owner's own estimate of replacement cost, in whole currency units. */
    replacementValue: real("replacement_value"),
    replacementValueBasis: text("replacement_value_basis", {
      enum: ["owner_estimate", "quoted_evidence", "unknown"],
    })
      .notNull()
      .default("unknown"),
    locationRegion: text("location_region").notNull().default(""),
    /** Private: exact pickup address, released only to the reserved recipient. */
    collectionAddress: text("collection_address").notNull().default(""),
    collectionWindowStart: text("collection_window_start"),
    collectionWindowEnd: text("collection_window_end"),
    knownDefects: text("known_defects").notNull().default(""),
    /** Private operational notes; never public. */
    privateNotes: text("private_notes").notNull().default(""),
    status: text("status", {
      enum: ["draft", "available", "reserved", "transferred", "withdrawn"],
    })
      .notNull()
      .default("draft"),
    /** Increments whenever public evidence changes. */
    evidenceVersion: integer("evidence_version").notNull().default(0),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("items_status_idx").on(t.status), index("items_org_idx").on(t.orgId)],
);

export const itemPhotos = sqliteTable(
  "item_photos",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    /** Path relative to the configured upload root, or /items/... for seeds. */
    storedPath: text("stored_path").notNull(),
    sha256: text("sha256").notNull(),
    caption: text("caption").notNull().default(""),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("item_photos_item_idx").on(t.itemId)],
);

/** Evidence provenance. This distinction is shown in the UI everywhere. */
export const EVIDENCE_SOURCES = [
  "owner_reported",
  "documented_test",
  "recipient_confirmed",
  "ai_suggested_unconfirmed",
] as const;

export const itemSpecs = sqliteTable(
  "item_specs",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value").notNull(),
    source: text("source", { enum: EVIDENCE_SOURCES }).notNull(),
    /** AI suggestions are only published once the owner ticks them off. */
    confirmedByOwner: integer("confirmed_by_owner", { mode: "boolean" }).notNull().default(false),
    /** Free-text note on where the value came from, e.g. "label on rear panel". */
    basis: text("basis").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("item_specs_item_idx").on(t.itemId)],
);

export const conditionEvidence = sqliteTable(
  "condition_evidence",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["test_checklist", "owner_statement", "recipient_confirmation", "photo_observation", "defect_report"],
    }).notNull(),
    source: text("source", { enum: EVIDENCE_SOURCES }).notNull(),
    statement: text("statement").notNull(),
    recordedByOrgId: text("recorded_by_org_id").references(() => organizations.id),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
    recordedAt: text("recorded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("condition_evidence_item_idx").on(t.itemId)],
);

export const testChecklists = sqliteTable("test_checklists", {
  itemId: text("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  powersOn: text("powers_on", { enum: ["pass", "fail", "not_tested", "not_applicable"] })
    .notNull()
    .default("not_tested"),
  displayWorks: text("display_works", { enum: ["pass", "fail", "not_tested", "not_applicable"] })
    .notNull()
    .default("not_tested"),
  portsTested: text("ports_tested", { enum: ["pass", "fail", "partial", "not_tested", "not_applicable"] })
    .notNull()
    .default("not_tested"),
  cablesIncluded: text("cables_included", { enum: ["yes", "no", "partial"] }).notNull().default("no"),
  notes: text("notes").notNull().default(""),
  testedByOrgId: text("tested_by_org_id").references(() => organizations.id),
  testedAt: text("tested_at"),
});

/* ---------------------------------------------------------------- requests */

export const requests = sqliteTable(
  "requests",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    title: text("title").notNull(),
    /** Plain-language description from the recipient. */
    freeText: text("free_text").notNull().default(""),
    category: text("category", {
      enum: ["monitor", "peripheral", "small_electronics", "networking", "furniture", "other"],
    }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    minConditionGrade: text("min_condition_grade", {
      enum: ["working_good", "working_marks", "working_defects", "untested", "parts_only"],
    })
      .notNull()
      .default("working_defects"),
    /** JSON array of {label, value, required:boolean}. */
    requiredSpecs: text("required_specs").notNull().default("[]"),
    locationRegion: text("location_region").notNull().default(""),
    latitude: real("latitude"),
    longitude: real("longitude"),
    maxDistanceKm: real("max_distance_km"),
    collectionDeadline: text("collection_deadline"),
    needsCablesIncluded: integer("needs_cables_included", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: ["open", "fulfilled", "closed"] }).notNull().default("open"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("requests_status_idx").on(t.status), index("requests_org_idx").on(t.orgId)],
);

export const matchResults = sqliteTable(
  "match_results",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    eligible: integer("eligible", { mode: "boolean" }).notNull(),
    /** Rule-satisfaction score: constraints met / constraints checked. Not a probability. */
    constraintsMet: integer("constraints_met").notNull().default(0),
    constraintsChecked: integer("constraints_checked").notNull().default(0),
    semanticRank: integer("semantic_rank"),
    method: text("method", { enum: ["rules", "rules_and_semantic"] }).notNull().default("rules"),
    /** JSON string arrays. */
    reasons: text("reasons").notNull().default("[]"),
    blockers: text("blockers").notNull().default("[]"),
    missingInfo: text("missing_info").notNull().default("[]"),
    distanceKm: real("distance_km"),
    distanceBasis: text("distance_basis", { enum: ["region_centroid", "unknown"] })
      .notNull()
      .default("unknown"),
    computedAt: text("computed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("match_request_item_unique").on(t.requestId, t.itemId)],
);

/* --------------------------------------------------------------- transfers */

/** Off-chain transfer lifecycle. See src/lib/transfer-state.ts for transitions. */
export const TRANSFER_STATES = [
  "requested",
  "declined",
  "reserved",
  "released",
  "completed",
  "cancelled",
  "disputed",
] as const;

export const transfers = sqliteTable(
  "transfers",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    requestId: text("request_id").references(() => requests.id),
    donorOrgId: text("donor_org_id")
      .notNull()
      .references(() => organizations.id),
    recipientOrgId: text("recipient_org_id")
      .notNull()
      .references(() => organizations.id),
    state: text("state", { enum: TRANSFER_STATES }).notNull().default("requested"),
    /** Recipient's message when submitting the request. Visible to both parties only. */
    requestMessage: text("request_message").notNull().default(""),
    quantity: integer("quantity").notNull().default(1),
    donorReleaseAck: integer("donor_release_ack", { mode: "boolean" }).notNull().default(false),
    recipientReceiptAck: integer("recipient_receipt_ack", { mode: "boolean" }).notNull().default(false),
    /** Evidence version the recipient agreed to; re-ack required if it moves. */
    evidenceVersionAtReservation: integer("evidence_version_at_reservation"),
    requiresReacknowledgement: integer("requires_reacknowledgement", { mode: "boolean" })
      .notNull()
      .default(false),
    cancelReason: text("cancel_reason").notNull().default(""),
    disputeReason: text("dispute_reason").notNull().default(""),
    disputeRaisedByOrgId: text("dispute_raised_by_org_id").references(() => organizations.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    reservedAt: text("reserved_at"),
    releasedAt: text("released_at"),
    receivedAt: text("received_at"),
    completedAt: text("completed_at"),
    closedAt: text("closed_at"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    index("transfers_item_idx").on(t.itemId),
    index("transfers_state_idx").on(t.state),
    // One open request per (item, recipient org): blocks duplicate requests
    // without blocking a fresh request after an earlier one was closed.
    uniqueIndex("transfers_open_request_unique")
      .on(t.itemId, t.recipientOrgId)
      .where(sql`state = 'requested'`),
    // At most one active reservation per item, enforced by the database and
    // not only by application code.
    uniqueIndex("transfers_active_reservation_unique")
      .on(t.itemId)
      .where(sql`state in ('reserved', 'released')`),
  ],
);

export const transferEvents = sqliteTable(
  "transfer_events",
  {
    id: text("id").primaryKey(),
    transferId: text("transfer_id")
      .notNull()
      .references(() => transfers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    fromState: text("from_state"),
    toState: text("to_state"),
    actorOrgId: text("actor_org_id").references(() => organizations.id),
    note: text("note").notNull().default(""),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("transfer_events_transfer_idx").on(t.transferId)],
);

/* ------------------------------------------------------- evidence anchoring */

export const evidenceManifests = sqliteTable(
  "evidence_manifests",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    manifestVersion: text("manifest_version").notNull(),
    /** Canonical JSON exactly as hashed. Kept so anyone can recompute. */
    canonicalJson: text("canonical_json").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("manifest_item_version_unique").on(t.itemId, t.versionNumber)],
);

export const CHAIN_STATUSES = [
  "not_anchored",
  "pending",
  "confirmed",
  "failed",
  "simulated",
] as const;

export const chainTransactions = sqliteTable(
  "chain_transactions",
  {
    id: text("id").primaryKey(),
    /** Makes retries idempotent: same logical action never double-sends. */
    idempotencyKey: text("idempotency_key").notNull(),
    itemId: text("item_id").references(() => items.id, { onDelete: "cascade" }),
    transferId: text("transfer_id").references(() => transfers.id, { onDelete: "cascade" }),
    action: text("action", {
      enum: [
        "register_item",
        "update_evidence",
        "reserve_item",
        "cancel_reservation",
        "acknowledge_release",
        "acknowledge_receipt",
        "raise_dispute",
      ],
    }).notNull(),
    status: text("status", { enum: CHAIN_STATUSES }).notNull().default("not_anchored"),
    chainId: integer("chain_id"),
    contractAddress: text("contract_address"),
    fromAddress: text("from_address"),
    txHash: text("tx_hash"),
    blockNumber: integer("block_number"),
    gasUsed: text("gas_used"),
    errorMessage: text("error_message").notNull().default(""),
    attempts: integer("attempts").notNull().default(0),
    payload: text("payload").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    confirmedAt: text("confirmed_at"),
  },
  (t) => [
    uniqueIndex("chain_tx_idempotency_unique").on(t.idempotencyKey),
    index("chain_tx_item_idx").on(t.itemId),
  ],
);

export const chainEvents = sqliteTable(
  "chain_events",
  {
    id: text("id").primaryKey(),
    chainTransactionId: text("chain_transaction_id").references(() => chainTransactions.id, {
      onDelete: "cascade",
    }),
    itemId: text("item_id").references(() => items.id, { onDelete: "cascade" }),
    eventName: text("event_name").notNull(),
    argsJson: text("args_json").notNull().default("{}"),
    blockNumber: integer("block_number"),
    logIndex: integer("log_index"),
    txHash: text("tx_hash"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("chain_events_item_idx").on(t.itemId)],
);

/* ------------------------------------------------------------------ impact */

/** Named, versioned assumptions. Nothing is computed from a number not in here. */
export const impactAssumptions = sqliteTable(
  "impact_assumptions",
  {
    key: text("key").primaryKey(),
    label: text("label").notNull(),
    value: real("value"),
    unit: text("unit").notNull().default(""),
    source: text("source").notNull().default(""),
    sourceVersion: text("source_version").notNull().default(""),
    notes: text("notes").notNull().default(""),
    /** When false, any figure depending on this assumption is withheld. */
    isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(false),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

/* ---------------------------------------------------------------------- ai */

export const aiAnalyses = sqliteTable(
  "ai_analyses",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
    /** live = real model call; example = prerecorded sample; unavailable = no key. */
    mode: text("mode", { enum: ["live", "example", "unavailable"] }).notNull(),
    model: text("model").notNull().default(""),
    exampleKey: text("example_key"),
    photoHashes: text("photo_hashes").notNull().default("[]"),
    outputJson: text("output_json").notNull().default("{}"),
    validationError: text("validation_error").notNull().default(""),
    latencyMs: integer("latency_ms"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("ai_analyses_item_idx").on(t.itemId)],
);
