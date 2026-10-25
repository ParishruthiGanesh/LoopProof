#!/usr/bin/env tsx
/**
 * Deploys LoopProofRegistry to the local development chain and writes the
 * resulting address plus the per-organization development wallet keys into
 * .env.local (which is gitignored).
 *
 * The keys written here are the well-known Hardhat development accounts. They
 * hold no real value, exist only on the local chain, and are never sent to the
 * browser. Nothing in this script touches a public network or spends funds.
 */
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";

const RPC_URL = process.env.LOOPPROOF_RPC_URL?.trim() || "http://127.0.0.1:8545";
const CHAIN_ID = Number(process.env.LOOPPROOF_CHAIN_ID?.trim() || "31337");
/** Hardhat's documented default development mnemonic. */
const DEV_MNEMONIC = "test test test test test test test test test test test junk";

/** Organization id -> dev account index. Index 0 is the deployer. */
const ORG_ACCOUNTS: Array<{ orgId: string; index: number }> = [
  { orgId: "org-northfield-surplus", index: 1 },
  { orgId: "org-harbourside-learning", index: 2 },
  { orgId: "org-reloop-collective", index: 3 },
];

const chain = {
  id: CHAIN_ID,
  name: "LoopProof local development chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

function devAccount(index: number) {
  const account = mnemonicToAccount(DEV_MNEMONIC, { addressIndex: index });
  const hd = account.getHdKey();
  if (!hd.privateKey) throw new Error("Could not derive development private key");
  const privateKey = `0x${Buffer.from(hd.privateKey).toString("hex")}` as Hex;
  return { account, privateKey };
}

function upsertEnvLocal(values: Record<string, string>) {
  const file = path.join(process.cwd(), ".env.local");
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = existing.split("\n").filter((l) => l.trim().length > 0);
  const kept = lines.filter((line) => {
    if (line.startsWith("#")) return false; // the header is rewritten below
    const key = line.split("=")[0]?.trim();
    return !(key && key in values);
  });
  const header = [
    "# LoopProof local development environment.",
    "#  written by scripts/deploy-contract.ts — do not commit this file.",
    "#  These are the well-known public Hardhat development keys. They control",
    "#  nothing outside the local chain and hold no real value.",
  ];
  const body = Object.entries(values).map(([k, v]) => `${k}=${/[\s#"']/.test(v) ? JSON.stringify(v) : v}`);
  fs.writeFileSync(file, [...header, ...kept, ...body].join("\n") + "\n");
  return file;
}

async function main() {
  const artifactPath = path.join(
    process.cwd(),
    "artifacts/contracts/LoopProofRegistry.sol/LoopProofRegistry.json",
  );
  if (!fs.existsSync(artifactPath)) {
    console.error("Contract is not compiled. Run `npx hardhat compile` first.");
    process.exit(1);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as {
    abi: readonly unknown[];
    bytecode: Hex;
  };

  const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

  try {
    await publicClient.getChainId();
  } catch {
    console.error(
      `\nCannot reach a development chain at ${RPC_URL}.\n` +
        "Start one in another terminal with:  npm run chain:node\n",
    );
    process.exit(1);
  }

  const deployer = devAccount(0);
  const wallet = createWalletClient({ account: deployer.account, chain, transport: http(RPC_URL) });

  console.log(`deploying from ${deployer.account.address} to ${RPC_URL} (chainId ${CHAIN_ID})`);
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    console.error("Deployment failed:", receipt.status);
    process.exit(1);
  }

  const values: Record<string, string> = {
    LOOPPROOF_CONTRACT_ADDRESS: receipt.contractAddress,
    LOOPPROOF_RPC_URL: RPC_URL,
    LOOPPROOF_CHAIN_ID: String(CHAIN_ID),
    LOOPPROOF_CHAIN_LABEL: `Local development chain (Hardhat, chainId ${CHAIN_ID})`,
  };

  console.log("\norganization development wallets:");
  for (const { orgId, index } of ORG_ACCOUNTS) {
    const { account, privateKey } = devAccount(index);
    const slug = orgId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    values[`LOOPPROOF_WALLET_KEY_${slug}`] = privateKey;
    console.log(`  ${orgId.padEnd(26)} ${account.address}  (dev account #${index})`);
  }

  const file = upsertEnvLocal(values);
  console.log(`\ncontract deployed at ${receipt.contractAddress} in block ${receipt.blockNumber}`);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
  console.log("\nRestart `npm run dev` so the server picks up the new environment.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
