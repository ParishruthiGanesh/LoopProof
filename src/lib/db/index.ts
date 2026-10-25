import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { serverEnv } from "../env";

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

let cached: { sqlite: Database.Database; db: AppDatabase } | null = null;

export function openDatabase(filePath = serverEnv.databaseUrl) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const sqlite = new Database(absolute);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // Fail fast instead of hanging when another writer holds the lock.
  sqlite.pragma("busy_timeout = 5000");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

/** Process-wide handle. Next.js dev server reuses it across hot reloads. */
export function getDb(): AppDatabase {
  if (!cached) cached = openDatabase();
  return cached.db;
}

export function getSqlite(): Database.Database {
  if (!cached) cached = openDatabase();
  return cached.sqlite;
}

/**
 * Runs `fn` inside an IMMEDIATE transaction, which takes the write lock up
 * front. Used for reservation, where two concurrent requests must not both
 * see an unreserved item.
 */
export function inWriteTransaction<T>(fn: () => T): T {
  const sqlite = getSqlite();
  const wrapped = sqlite.transaction(fn);
  return wrapped.immediate();
}

export { schema };
