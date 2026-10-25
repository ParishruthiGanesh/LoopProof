-- LoopProof initial schema.
-- Mirrors src/lib/db/schema.ts. Applied by scripts/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('donor','recipient','both')),
  description      TEXT NOT NULL DEFAULT '',
  location_region  TEXT NOT NULL DEFAULT '',
  latitude         REAL,
  longitude        REAL,
  contact_email    TEXT NOT NULL DEFAULT '',
  contact_phone    TEXT NOT NULL DEFAULT '',
  street_address   TEXT NOT NULL DEFAULT '',
  wallet_address   TEXT,
  is_demo          INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff','admin')),
  is_demo       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX users_email_unique ON users(email);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE items (
  id                       TEXT PRIMARY KEY,
  org_id                   TEXT NOT NULL REFERENCES organizations(id),
  title                    TEXT NOT NULL,
  category                 TEXT NOT NULL CHECK (category IN ('monitor','peripheral','small_electronics','networking','furniture','other')),
  description              TEXT NOT NULL DEFAULT '',
  brand                    TEXT NOT NULL DEFAULT 'unknown',
  model                    TEXT NOT NULL DEFAULT 'unknown',
  condition_grade          TEXT NOT NULL CHECK (condition_grade IN ('working_good','working_marks','working_defects','untested','parts_only')),
  quantity                 INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  mass_kg                  REAL,
  mass_basis               TEXT NOT NULL DEFAULT 'unknown' CHECK (mass_basis IN ('measured','estimated','unknown')),
  replacement_value        REAL,
  replacement_value_basis  TEXT NOT NULL DEFAULT 'unknown' CHECK (replacement_value_basis IN ('owner_estimate','quoted_evidence','unknown')),
  location_region          TEXT NOT NULL DEFAULT '',
  collection_address       TEXT NOT NULL DEFAULT '',
  collection_window_start  TEXT,
  collection_window_end    TEXT,
  known_defects            TEXT NOT NULL DEFAULT '',
  private_notes            TEXT NOT NULL DEFAULT '',
  status                   TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','available','reserved','transferred','withdrawn')),
  evidence_version         INTEGER NOT NULL DEFAULT 0,
  is_demo                  INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX items_status_idx ON items(status);
CREATE INDEX items_org_idx ON items(org_id);

CREATE TABLE item_photos (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  stored_path TEXT NOT NULL,
  sha256      TEXT NOT NULL,
  caption     TEXT NOT NULL DEFAULT '',
  mime_type   TEXT NOT NULL,
  byte_size   INTEGER NOT NULL,
  is_public   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX item_photos_item_idx ON item_photos(item_id);

CREATE TABLE item_specs (
  id                 TEXT PRIMARY KEY,
  item_id            TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  label              TEXT NOT NULL,
  value              TEXT NOT NULL,
  source             TEXT NOT NULL CHECK (source IN ('owner_reported','documented_test','recipient_confirmed','ai_suggested_unconfirmed')),
  confirmed_by_owner INTEGER NOT NULL DEFAULT 0,
  basis              TEXT NOT NULL DEFAULT '',
  sort_order         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX item_specs_item_idx ON item_specs(item_id);

CREATE TABLE condition_evidence (
  id                  TEXT PRIMARY KEY,
  item_id             TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN ('test_checklist','owner_statement','recipient_confirmation','photo_observation','defect_report')),
  source              TEXT NOT NULL CHECK (source IN ('owner_reported','documented_test','recipient_confirmed','ai_suggested_unconfirmed')),
  statement           TEXT NOT NULL,
  recorded_by_org_id  TEXT REFERENCES organizations(id),
  is_public           INTEGER NOT NULL DEFAULT 1,
  recorded_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX condition_evidence_item_idx ON condition_evidence(item_id);

CREATE TABLE test_checklists (
  item_id          TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  powers_on        TEXT NOT NULL DEFAULT 'not_tested' CHECK (powers_on IN ('pass','fail','not_tested','not_applicable')),
  display_works    TEXT NOT NULL DEFAULT 'not_tested' CHECK (display_works IN ('pass','fail','not_tested','not_applicable')),
  ports_tested     TEXT NOT NULL DEFAULT 'not_tested' CHECK (ports_tested IN ('pass','fail','partial','not_tested','not_applicable')),
  cables_included  TEXT NOT NULL DEFAULT 'no' CHECK (cables_included IN ('yes','no','partial')),
  notes            TEXT NOT NULL DEFAULT '',
  tested_by_org_id TEXT REFERENCES organizations(id),
  tested_at        TEXT
);

CREATE TABLE requests (
  id                     TEXT PRIMARY KEY,
  org_id                 TEXT NOT NULL REFERENCES organizations(id),
  title                  TEXT NOT NULL,
  free_text              TEXT NOT NULL DEFAULT '',
  category               TEXT NOT NULL CHECK (category IN ('monitor','peripheral','small_electronics','networking','furniture','other')),
  quantity               INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  min_condition_grade    TEXT NOT NULL DEFAULT 'working_defects' CHECK (min_condition_grade IN ('working_good','working_marks','working_defects','untested','parts_only')),
  required_specs         TEXT NOT NULL DEFAULT '[]',
  location_region        TEXT NOT NULL DEFAULT '',
  latitude               REAL,
  longitude              REAL,
  max_distance_km        REAL,
  collection_deadline    TEXT,
  needs_cables_included  INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fulfilled','closed')),
  is_demo                INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX requests_status_idx ON requests(status);
CREATE INDEX requests_org_idx ON requests(org_id);

CREATE TABLE match_results (
  id                  TEXT PRIMARY KEY,
  request_id          TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  item_id             TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  eligible            INTEGER NOT NULL,
  constraints_met     INTEGER NOT NULL DEFAULT 0,
  constraints_checked INTEGER NOT NULL DEFAULT 0,
  semantic_rank       INTEGER,
  method              TEXT NOT NULL DEFAULT 'rules' CHECK (method IN ('rules','rules_and_semantic')),
  reasons             TEXT NOT NULL DEFAULT '[]',
  blockers            TEXT NOT NULL DEFAULT '[]',
  missing_info        TEXT NOT NULL DEFAULT '[]',
  distance_km         REAL,
  distance_basis      TEXT NOT NULL DEFAULT 'unknown' CHECK (distance_basis IN ('region_centroid','unknown')),
  computed_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX match_request_item_unique ON match_results(request_id, item_id);

CREATE TABLE transfers (
  id                              TEXT PRIMARY KEY,
  item_id                         TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  request_id                      TEXT REFERENCES requests(id),
  donor_org_id                    TEXT NOT NULL REFERENCES organizations(id),
  recipient_org_id                TEXT NOT NULL REFERENCES organizations(id),
  state                           TEXT NOT NULL DEFAULT 'requested' CHECK (state IN ('requested','declined','reserved','released','completed','cancelled','disputed')),
  request_message                 TEXT NOT NULL DEFAULT '',
  quantity                        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  donor_release_ack               INTEGER NOT NULL DEFAULT 0,
  recipient_receipt_ack           INTEGER NOT NULL DEFAULT 0,
  evidence_version_at_reservation INTEGER,
  requires_reacknowledgement      INTEGER NOT NULL DEFAULT 0,
  cancel_reason                   TEXT NOT NULL DEFAULT '',
  dispute_reason                  TEXT NOT NULL DEFAULT '',
  dispute_raised_by_org_id        TEXT REFERENCES organizations(id),
  created_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reserved_at                     TEXT,
  released_at                     TEXT,
  received_at                     TEXT,
  completed_at                    TEXT,
  closed_at                       TEXT,
  is_demo                         INTEGER NOT NULL DEFAULT 0,
  -- Completion is only valid when both acknowledgments are recorded. The
  -- database refuses to store a completed transfer that lacks either one.
  CHECK (state <> 'completed' OR (donor_release_ack = 1 AND recipient_receipt_ack = 1))
);
CREATE INDEX transfers_item_idx ON transfers(item_id);
CREATE INDEX transfers_state_idx ON transfers(state);
-- One open request per (item, recipient org).
CREATE UNIQUE INDEX transfers_open_request_unique
  ON transfers(item_id, recipient_org_id) WHERE state = 'requested';
-- At most one active reservation per item, enforced by the database.
CREATE UNIQUE INDEX transfers_active_reservation_unique
  ON transfers(item_id) WHERE state IN ('reserved','released');

CREATE TABLE transfer_events (
  id            TEXT PRIMARY KEY,
  transfer_id   TEXT NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  from_state    TEXT,
  to_state      TEXT,
  actor_org_id  TEXT REFERENCES organizations(id),
  note          TEXT NOT NULL DEFAULT '',
  is_public     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX transfer_events_transfer_idx ON transfer_events(transfer_id);

CREATE TABLE evidence_manifests (
  id               TEXT PRIMARY KEY,
  item_id          TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  version_number   INTEGER NOT NULL,
  manifest_version TEXT NOT NULL,
  canonical_json   TEXT NOT NULL,
  sha256           TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX manifest_item_version_unique ON evidence_manifests(item_id, version_number);

CREATE TABLE chain_transactions (
  id               TEXT PRIMARY KEY,
  idempotency_key  TEXT NOT NULL,
  item_id          TEXT REFERENCES items(id) ON DELETE CASCADE,
  transfer_id      TEXT REFERENCES transfers(id) ON DELETE CASCADE,
  action           TEXT NOT NULL CHECK (action IN ('register_item','update_evidence','reserve_item','cancel_reservation','acknowledge_release','acknowledge_receipt','raise_dispute')),
  status           TEXT NOT NULL DEFAULT 'not_anchored' CHECK (status IN ('not_anchored','pending','confirmed','failed','simulated')),
  chain_id         INTEGER,
  contract_address TEXT,
  from_address     TEXT,
  tx_hash          TEXT,
  block_number     INTEGER,
  gas_used         TEXT,
  error_message    TEXT NOT NULL DEFAULT '',
  attempts         INTEGER NOT NULL DEFAULT 0,
  payload          TEXT NOT NULL DEFAULT '{}',
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at     TEXT
);
CREATE UNIQUE INDEX chain_tx_idempotency_unique ON chain_transactions(idempotency_key);
CREATE INDEX chain_tx_item_idx ON chain_transactions(item_id);

CREATE TABLE chain_events (
  id                    TEXT PRIMARY KEY,
  chain_transaction_id  TEXT REFERENCES chain_transactions(id) ON DELETE CASCADE,
  item_id               TEXT REFERENCES items(id) ON DELETE CASCADE,
  event_name            TEXT NOT NULL,
  args_json             TEXT NOT NULL DEFAULT '{}',
  block_number          INTEGER,
  log_index             INTEGER,
  tx_hash               TEXT,
  created_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX chain_events_item_idx ON chain_events(item_id);

CREATE TABLE impact_assumptions (
  key            TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  value          REAL,
  unit           TEXT NOT NULL DEFAULT '',
  source         TEXT NOT NULL DEFAULT '',
  source_version TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  is_available   INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ai_analyses (
  id               TEXT PRIMARY KEY,
  item_id          TEXT REFERENCES items(id) ON DELETE SET NULL,
  mode             TEXT NOT NULL CHECK (mode IN ('live','example','unavailable')),
  model            TEXT NOT NULL DEFAULT '',
  example_key      TEXT,
  photo_hashes     TEXT NOT NULL DEFAULT '[]',
  output_json      TEXT NOT NULL DEFAULT '{}',
  validation_error TEXT NOT NULL DEFAULT '',
  latency_ms       INTEGER,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ai_analyses_item_idx ON ai_analyses(item_id);
