#!/usr/bin/env tsx
/**
 * Repeatable reset: drops the database file, re-applies migrations, re-seeds
 * demonstration data. Uploaded photos are kept unless --purge-uploads.
 */
import fs from "node:fs";
import path from "node:path";
import { runMigrations } from "./migrate";
import { seed } from "./seed";
import { serverEnv } from "../src/lib/env";

const abs = (p: string) => (path.isAbsolute(p) ? p : path.join(process.cwd(), p));

async function main() {
  const dbPath = abs(serverEnv.databaseUrl);
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = dbPath + suffix;
    if (fs.existsSync(file)) fs.rmSync(file);
  }
  console.log(`removed ${path.relative(process.cwd(), dbPath)}`);

  if (process.argv.includes("--purge-uploads")) {
    const uploads = abs(serverEnv.uploadDir);
    if (fs.existsSync(uploads)) fs.rmSync(uploads, { recursive: true, force: true });
    console.log("removed uploads");
  }

  runMigrations();
  await seed();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
