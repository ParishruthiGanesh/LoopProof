#!/usr/bin/env tsx
/**
 * Registers every listing's current public evidence manifest on the local
 * development chain, signing with each owning organization's development
 * wallet. Run once after `npm run chain:deploy` so the demonstration data has
 * a real anchor to verify against.
 *
 * Idempotent: an item already registered is re-anchored only if its digest
 * moved, and a confirmed transaction is never sent twice.
 */
import { openDatabase } from "../src/lib/db";
import { serverEnv, chainConfigured } from "../src/lib/env";

async function main() {
  if (!chainConfigured()) {
    console.error(
      "No LOOPPROOF_CONTRACT_ADDRESS is set. Run `npm run chain:node` in one terminal and `npm run chain:deploy` in another first.",
    );
    process.exit(1);
  }

  const { rpcHealth } = await import("../src/lib/chain");
  const health = await rpcHealth();
  if (!health.reachable) {
    console.error(`Cannot reach ${serverEnv.rpcUrl}. Start the chain with \`npm run chain:node\`.`);
    process.exit(1);
  }
  if (!health.contractDeployed) {
    console.error(
      `No contract code at ${serverEnv.contractAddress}. Re-run \`npm run chain:deploy\` against the running node.`,
    );
    process.exit(1);
  }

  const { sqlite } = openDatabase();
  const rows = sqlite
    .prepare("SELECT id, org_id, status FROM items WHERE status <> 'draft' ORDER BY created_at")
    .all() as Array<{ id: string; org_id: string; status: string }>;
  sqlite.close();

  const { publishItem } = await import("../src/lib/items");

  let confirmed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const result = await publishItem(row.id, row.org_id);
    const status = result.anchorResult.status;
    if (result.anchorResult.deduplicated) skipped += 1;
    else if (status === "confirmed") confirmed += 1;
    else failed += 1;
    const detail = result.anchorResult.error ? ` — ${result.anchorResult.error}` : "";
    console.log(
      `${row.id.padEnd(16)} v${result.snapshot.versionNumber} ${status}${result.anchorResult.deduplicated ? " (already anchored)" : ""}${detail}`,
    );
  }

  console.log(`\n${confirmed} anchored, ${skipped} already anchored, ${failed} not anchored.`);
  if (failed > 0) {
    console.log(
      "\nAn item that is mid-transfer on chain cannot have its anchor moved; that is intended.\n" +
        "If you have just run `npm run db:reset` against a chain that still holds older state,\n" +
        "restart the node (`npm run chain:node`), re-run `npm run chain:deploy`, then anchor again.",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
