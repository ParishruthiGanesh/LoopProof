#!/usr/bin/env tsx
/** Applies db/migrations/*.sql in filename order, once each. */
import fs from "node:fs";
import path from "node:path";
import { openDatabase } from "../src/lib/db";
import { serverEnv } from "../src/lib/env";

const migrationsDir = path.join(process.cwd(), "db", "migrations");

export function runMigrations(dbPath = serverEnv.databaseUrl) {
  const { sqlite } = openDatabase(dbPath);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = new Set(
    sqlite.prepare("SELECT name FROM _migrations").all().map((r) => (r as { name: string }).name),
  );
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sqlText = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(sqlText);
      sqlite.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
      sqlite.exec("COMMIT");
      console.log(`applied ${file}`);
      count += 1;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }
  sqlite.close();
  return { applied: count, total: files.length };
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const result = runMigrations();
  console.log(`migrations: ${result.applied} newly applied, ${result.total} total`);
}
