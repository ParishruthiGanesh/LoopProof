/**
 * Test harness. Each suite gets its own SQLite file, created from the real
 * migrations and the real seed script, so tests exercise the shipped schema.
 *
 * Run with `npm test`, which passes --conditions=react-server so that the
 * `server-only` guard in the service modules resolves to a no-op.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type Harness = Awaited<ReturnType<typeof createHarness>>;

export async function createHarness(label: string, options: { seed?: boolean } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `loopproof-${label}-`));
  const dbPath = path.join(dir, "test.db");
  process.env.LOOPPROOF_DATABASE_PATH = dbPath;
  process.env.LOOPPROOF_UPLOAD_DIR = path.join(dir, "uploads");
  // No contract address: the chain layer must degrade honestly rather than throw.
  delete process.env.LOOPPROOF_CONTRACT_ADDRESS;
  delete process.env.ANTHROPIC_API_KEY;
  process.env.LOOPPROOF_CHAIN_SIMULATION = "false";

  const { runMigrations } = await import("../scripts/migrate");
  runMigrations(dbPath);
  if (options.seed !== false) {
    const { seed } = await import("../scripts/seed");
    await seed(dbPath);
  }

  const db = await import("../src/lib/db");
  const sqlite = db.openDatabase(dbPath).sqlite;

  return {
    dir,
    dbPath,
    sqlite,
    cleanup() {
      sqlite.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A SessionUser as the auth layer would produce it, for service-level calls. */
export function sessionFor(
  sqlite: Harness["sqlite"],
  orgId: string,
): {
  userId: string;
  name: string;
  email: string;
  role: "staff" | "admin";
  orgId: string;
  orgName: string;
  orgKind: "donor" | "recipient" | "both";
  orgWalletAddress: string | null;
  orgLocationRegion: string;
  isDemo: boolean;
} {
  const row = sqlite
    .prepare(
      `SELECT u.id AS userId, u.name, u.email, u.role, o.id AS orgId, o.name AS orgName,
              o.kind AS orgKind, o.wallet_address AS orgWalletAddress, o.location_region AS orgLocationRegion
         FROM users u JOIN organizations o ON o.id = u.org_id WHERE o.id = ? LIMIT 1`,
    )
    .get(orgId) as Record<string, string>;
  if (!row) throw new Error(`No seeded user for org ${orgId}`);
  return {
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: row.role as "staff" | "admin",
    orgId: row.orgId,
    orgName: row.orgName,
    orgKind: row.orgKind as "donor" | "recipient" | "both",
    orgWalletAddress: row.orgWalletAddress ?? null,
    orgLocationRegion: row.orgLocationRegion,
    isDemo: true,
  };
}

export const ORGS = {
  donor: "org-northfield-surplus",
  recipient: "org-harbourside-learning",
  other: "org-reloop-collective",
} as const;
