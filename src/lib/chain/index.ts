import "server-only";
import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { eq } from "drizzle-orm";
import { loopProofRegistryAbi } from "./abi";
import { getDb, schema } from "../db";
import { serverEnv, chainConfigured } from "../env";
import { uuid } from "../ids";

export { loopProofRegistryAbi };

export type ChainStatus = (typeof schema.CHAIN_STATUSES)[number];

export type ChainAction =
  | "register_item"
  | "update_evidence"
  | "reserve_item"
  | "cancel_reservation"
  | "acknowledge_release"
  | "acknowledge_receipt"
  | "raise_dispute";

/** Mirror of the contract's State enum. */
export const CHAIN_STATE_NAMES = [
  "None",
  "Registered",
  "Reserved",
  "Released",
  "Completed",
  "Disputed",
] as const;

export const CHAIN_STATUS_LABELS: Record<ChainStatus, string> = {
  not_anchored: "Not anchored",
  pending: "Awaiting confirmation",
  confirmed: "Confirmed on local development chain",
  failed: "Failed",
  simulated: "Simulated (simulation mode enabled)",
};

const localChain = {
  id: serverEnv.chainId,
  name: serverEnv.chainLabel,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [serverEnv.rpcUrl] } },
} as const;

let publicClientCache: PublicClient | null = null;

export function publicClient(): PublicClient {
  if (!publicClientCache) {
    publicClientCache = createPublicClient({
      chain: localChain,
      transport: http(serverEnv.rpcUrl, { timeout: 8000, retryCount: 1 }),
    }) as PublicClient;
  }
  return publicClientCache;
}

/**
 * Development wallets. Each fictional organization is mapped to its own key,
 * read from the server environment only. These keys are never sent to the
 * browser and are not committed to the repository.
 */
function orgPrivateKey(orgId: string): Hex | null {
  const slug = orgId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
  const raw = process.env[`LOOPPROOF_WALLET_KEY_${slug}`]?.trim();
  if (!raw) return null;
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

export function orgHasWalletKey(orgId: string): boolean {
  return orgPrivateKey(orgId) !== null;
}

function walletFor(orgId: string): { client: WalletClient; address: Address } | null {
  const key = orgPrivateKey(orgId);
  if (!key) return null;
  const account = privateKeyToAccount(key);
  const client = createWalletClient({
    account,
    chain: localChain,
    transport: http(serverEnv.rpcUrl, { timeout: 8000, retryCount: 1 }),
  });
  return { client, address: account.address };
}

export type RpcHealth = {
  configured: boolean;
  reachable: boolean;
  chainId: number | null;
  blockNumber: string | null;
  contractAddress: string | null;
  contractDeployed: boolean;
  chainLabel: string;
  simulationMode: boolean;
  error: string | null;
};

export async function rpcHealth(): Promise<RpcHealth> {
  const base: RpcHealth = {
    configured: chainConfigured(),
    reachable: false,
    chainId: null,
    blockNumber: null,
    contractAddress: serverEnv.contractAddress || null,
    contractDeployed: false,
    chainLabel: serverEnv.chainLabel,
    simulationMode: serverEnv.simulationMode,
    error: null,
  };
  try {
    const client = publicClient();
    const [chainId, blockNumber] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
    base.reachable = true;
    base.chainId = chainId;
    base.blockNumber = blockNumber.toString();
    if (serverEnv.contractAddress) {
      const code = await client.getCode({ address: getAddress(serverEnv.contractAddress) });
      base.contractDeployed = Boolean(code && code !== "0x");
    }
  } catch (error) {
    base.error = error instanceof Error ? error.message : String(error);
  }
  return base;
}

/* ----------------------------------------------------------- transactions */

export type AnchorRequest = {
  action: ChainAction;
  /** Same key for the same logical action, so retries never double-send. */
  idempotencyKey: string;
  itemId: string;
  itemKey: Hex;
  transferId?: string | null;
  /** Organization whose development wallet signs. */
  actingOrgId: string;
  args: readonly unknown[];
  payload?: Record<string, unknown>;
};

export type AnchorResult = {
  chainTransactionId: string;
  status: ChainStatus;
  txHash: string | null;
  blockNumber: number | null;
  error: string | null;
  /** True when this call did not send anything because the work was already done. */
  deduplicated: boolean;
};

/**
 * Sends one state change to the contract and records the attempt.
 *
 * Never throws for chain-side problems: a failure is persisted with
 * status "failed" and an error message, and the caller decides what to show.
 * Off-chain workflow state is deliberately NOT rolled back on failure — the
 * acknowledgment really happened, it just is not anchored yet, and the row can
 * be retried with the same idempotency key.
 */
export async function anchor(request: AnchorRequest): Promise<AnchorResult> {
  const db = getDb();

  const existing = await db
    .select()
    .from(schema.chainTransactions)
    .where(eq(schema.chainTransactions.idempotencyKey, request.idempotencyKey))
    .limit(1);

  const prior = existing[0];
  if (prior && prior.status === "simulated") {
    return {
      chainTransactionId: prior.id,
      status: prior.status,
      txHash: prior.txHash,
      blockNumber: prior.blockNumber,
      error: null,
      deduplicated: true,
    };
  }
  if (prior && prior.status === "confirmed") {
    // A confirmed row is only still true if it was sent to the contract we are
    // configured for now, AND its transaction still exists on that chain.
    // Redeploying gives a new address; restarting a development chain gives the
    // same address with none of the history. Either way a stale row must not
    // keep claiming confirmation.
    const sameContract =
      (prior.contractAddress ?? "").toLowerCase() === serverEnv.contractAddress.toLowerCase();
    const stillThere = sameContract ? await recordedTransactionStillExists(prior.txHash) : false;
    if (stillThere !== false) {
      return {
        chainTransactionId: prior.id,
        status: prior.status,
        txHash: prior.txHash,
        blockNumber: prior.blockNumber,
        error: null,
        deduplicated: true,
      };
    }
    await db
      .update(schema.chainTransactions)
      .set({
        status: "not_anchored",
        txHash: null,
        blockNumber: null,
        confirmedAt: null,
        contractAddress: serverEnv.contractAddress || null,
        errorMessage:
          "The previous confirmation does not apply to the contract currently configured. The chain was most likely reset or redeployed, so this anchor is being re-sent.",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.chainTransactions.id, prior.id));
  }
  if (prior && prior.status === "pending" && prior.txHash) {
    // A previous attempt sent a transaction; find out how it ended rather than
    // sending a second one.
    const settled = await settlePending(prior.id);
    if (settled.status !== "pending") return { ...settled, deduplicated: true };
    return { ...settled, deduplicated: true };
  }

  const rowId = prior?.id ?? uuid();
  const now = new Date().toISOString();

  if (!prior) {
    await db.insert(schema.chainTransactions).values({
      id: rowId,
      idempotencyKey: request.idempotencyKey,
      itemId: request.itemId,
      transferId: request.transferId ?? null,
      action: request.action,
      status: "not_anchored",
      chainId: serverEnv.chainId,
      contractAddress: serverEnv.contractAddress || null,
      // itemKey and args are stored so a retry can replay the exact same call.
      payload: JSON.stringify({
        ...(request.payload ?? {}),
        itemKey: request.itemKey,
        args: request.args,
      }),
      createdAt: now,
      updatedAt: now,
    });
  }

  const fail = async (message: string): Promise<AnchorResult> => {
    await db
      .update(schema.chainTransactions)
      .set({
        status: "failed",
        errorMessage: message,
        attempts: (prior?.attempts ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.chainTransactions.id, rowId));
    return {
      chainTransactionId: rowId,
      status: "failed",
      txHash: null,
      blockNumber: null,
      error: message,
      deduplicated: false,
    };
  };

  if (serverEnv.simulationMode) {
    await db
      .update(schema.chainTransactions)
      .set({
        status: "simulated",
        errorMessage: "",
        attempts: (prior?.attempts ?? 0) + 1,
        updatedAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
      })
      .where(eq(schema.chainTransactions.id, rowId));
    return {
      chainTransactionId: rowId,
      status: "simulated",
      txHash: null,
      blockNumber: null,
      error: null,
      deduplicated: false,
    };
  }

  if (!chainConfigured()) {
    await db
      .update(schema.chainTransactions)
      .set({
        status: "not_anchored",
        errorMessage: "No contract address configured (LOOPPROOF_CONTRACT_ADDRESS).",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.chainTransactions.id, rowId));
    return {
      chainTransactionId: rowId,
      status: "not_anchored",
      txHash: null,
      blockNumber: null,
      error: "No contract address configured.",
      deduplicated: false,
    };
  }

  const wallet = walletFor(request.actingOrgId);
  if (!wallet) {
    return fail(
      `No development wallet key configured for organization ${request.actingOrgId}. Run \`npm run chain:deploy\`.`,
    );
  }

  const functionName =
    request.action === "register_item"
      ? "registerItem"
      : request.action === "update_evidence"
        ? "updateEvidenceHash"
        : request.action === "reserve_item"
          ? "reserveItem"
          : request.action === "cancel_reservation"
            ? "cancelReservation"
            : request.action === "acknowledge_release"
              ? "acknowledgeRelease"
              : request.action === "acknowledge_receipt"
                ? "acknowledgeReceipt"
                : "raiseDispute";

  // A plain send to an address with no contract code produces a successful
  // receipt while doing nothing at all. Refuse to treat that as an anchor.
  try {
    const code = await publicClient().getCode({ address: getAddress(serverEnv.contractAddress) });
    if (!code || code === "0x") {
      return fail(
        `No contract is deployed at ${serverEnv.contractAddress} on chain ${serverEnv.chainId}. Run \`npm run chain:deploy\`.`,
      );
    }
  } catch (error) {
    return fail(cleanChainError(error));
  }

  // Simulate before sending, so a call the contract would reject fails here
  // with the contract's own error rather than becoming a reverted transaction.
  let txHash: Hex;
  try {
    const { request: simulated } = await publicClient().simulateContract({
      address: getAddress(serverEnv.contractAddress),
      abi: loopProofRegistryAbi,
      functionName,
      args: request.args as never,
      account: wallet.client.account!,
    });
    txHash = await wallet.client.writeContract(simulated as never);
  } catch (error) {
    return fail(cleanChainError(error));
  }

  await db
    .update(schema.chainTransactions)
    .set({
      status: "pending",
      txHash,
      fromAddress: wallet.address,
      errorMessage: "",
      attempts: (prior?.attempts ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.chainTransactions.id, rowId));

  // The transaction is only "confirmed" once its receipt says so.
  const settled = await settlePending(rowId);
  return { ...settled, deduplicated: false };
}

/**
 * Does the recorded transaction still exist on the chain we are configured for?
 *   true  — yes
 *   false — definitely not; the row is stale
 *   null  — could not tell (RPC unreachable). The caller treats this as "leave
 *           it alone", because re-sending on a flaky connection is worse than
 *           waiting.
 */
async function recordedTransactionStillExists(txHash: string | null): Promise<boolean | null> {
  if (!txHash) return false;
  try {
    const receipt = await publicClient().getTransactionReceipt({ hash: txHash as Hex });
    return receipt.status === "success";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/could not be found|not be found|TransactionReceiptNotFound/i.test(message)) return false;
    return null; // network problem, not an answer
  }
}

/** Waits for a receipt and records the real outcome. */
export async function settlePending(chainTransactionId: string): Promise<Omit<AnchorResult, "deduplicated">> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.chainTransactions)
    .where(eq(schema.chainTransactions.id, chainTransactionId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error(`Unknown chain transaction ${chainTransactionId}`);
  if (!row.txHash) {
    return {
      chainTransactionId,
      status: row.status,
      txHash: null,
      blockNumber: null,
      error: row.errorMessage || null,
    };
  }

  try {
    const receipt = await publicClient().waitForTransactionReceipt({
      hash: row.txHash as Hex,
      timeout: 20_000,
    });
    if (receipt.status !== "success") {
      await db
        .update(schema.chainTransactions)
        .set({
          status: "failed",
          errorMessage: "Transaction reverted on chain.",
          blockNumber: Number(receipt.blockNumber),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.chainTransactions.id, chainTransactionId));
      return {
        chainTransactionId,
        status: "failed",
        txHash: row.txHash,
        blockNumber: Number(receipt.blockNumber),
        error: "Transaction reverted on chain.",
      };
    }

    await db
      .update(schema.chainTransactions)
      .set({
        status: "confirmed",
        blockNumber: Number(receipt.blockNumber),
        gasUsed: receipt.gasUsed.toString(),
        errorMessage: "",
        updatedAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
      })
      .where(eq(schema.chainTransactions.id, chainTransactionId));

    await recordEventsFromReceipt(chainTransactionId, row.itemId, receipt.blockNumber, row.txHash as Hex);

    return {
      chainTransactionId,
      status: "confirmed",
      txHash: row.txHash,
      blockNumber: Number(receipt.blockNumber),
      error: null,
    };
  } catch (error) {
    // Still unconfirmed: keep it pending and retryable, never call it success.
    const message = cleanChainError(error);
    await db
      .update(schema.chainTransactions)
      .set({ status: "pending", errorMessage: message, updatedAt: new Date().toISOString() })
      .where(eq(schema.chainTransactions.id, chainTransactionId));
    return {
      chainTransactionId,
      status: "pending",
      txHash: row.txHash,
      blockNumber: null,
      error: message,
    };
  }
}

async function recordEventsFromReceipt(
  chainTransactionId: string,
  itemId: string | null,
  blockNumber: bigint,
  txHash: Hex,
) {
  const db = getDb();
  try {
    const logs = await publicClient().getContractEvents({
      address: getAddress(serverEnv.contractAddress),
      abi: loopProofRegistryAbi,
      fromBlock: blockNumber,
      toBlock: blockNumber,
    });
    for (const log of logs) {
      if (log.transactionHash?.toLowerCase() !== txHash.toLowerCase()) continue;
      await db.insert(schema.chainEvents).values({
        id: uuid(),
        chainTransactionId,
        itemId,
        eventName: log.eventName ?? "Unknown",
        argsJson: JSON.stringify(log.args ?? {}, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
        blockNumber: Number(log.blockNumber),
        logIndex: log.logIndex ?? null,
        txHash,
      });
    }
  } catch {
    // Event indexing is best-effort; the receipt is the authoritative record.
  }
}

/* ------------------------------------------------------------------ reads */

export type OnChainItem = {
  owner: Address;
  recipient: Address;
  evidenceHash: Hex;
  manifestVersion: string;
  state: number;
  stateName: string;
  reservationNonce: number;
  registeredAt: number;
  releasedAt: number;
  receivedAt: number;
  donorReleaseAck: boolean;
  recipientReceiptAck: boolean;
};

export type OnChainRead =
  | { status: "found"; item: OnChainItem }
  | { status: "not_registered" }
  | { status: "not_configured" }
  /** The chain could not be reached. This is NOT the same as "not registered",
   *  and the interface must never present it as though it were. */
  | { status: "unreachable"; error: string };

/**
 * Reads an item from the contract, distinguishing "this item is not on chain"
 * from "we could not ask". Callers that only need the item use
 * `readOnChainItem`, which collapses both into null.
 */
export async function readOnChainItemResult(itemKey: Hex): Promise<OnChainRead> {
  if (!chainConfigured()) return { status: "not_configured" };
  try {
    const raw = (await publicClient().readContract({
      address: getAddress(serverEnv.contractAddress),
      abi: loopProofRegistryAbi,
      functionName: "getItem",
      args: [itemKey],
    })) as {
      owner: Address;
      recipient: Address;
      evidenceHash: Hex;
      manifestVersion: string;
      state: number;
      reservationNonce: number;
      registeredAt: bigint;
      releasedAt: bigint;
      receivedAt: bigint;
      donorReleaseAck: boolean;
      recipientReceiptAck: boolean;
    };
    if (Number(raw.state) === 0) return { status: "not_registered" };
    return {
      status: "found",
      item: {
        owner: raw.owner,
        recipient: raw.recipient,
        evidenceHash: raw.evidenceHash,
        manifestVersion: raw.manifestVersion,
        state: Number(raw.state),
        stateName: CHAIN_STATE_NAMES[Number(raw.state)] ?? "Unknown",
        reservationNonce: Number(raw.reservationNonce),
        registeredAt: Number(raw.registeredAt),
        releasedAt: Number(raw.releasedAt),
        receivedAt: Number(raw.receivedAt),
        donorReleaseAck: raw.donorReleaseAck,
        recipientReceiptAck: raw.recipientReceiptAck,
      },
    };
  } catch (error) {
    return { status: "unreachable", error: cleanChainError(error) };
  }
}

export async function readOnChainItem(itemKey: Hex): Promise<OnChainItem | null> {
  const result = await readOnChainItemResult(itemKey);
  return result.status === "found" ? result.item : null;
}

function cleanChainError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const first = error.message.split("\n")[0].trim();
  if (/fetch failed|ECONNREFUSED|socket hang up|timed out/i.test(error.message)) {
    return `Blockchain RPC at ${serverEnv.rpcUrl} is unavailable (${first}).`;
  }
  // Surface the contract's own error name; it is the useful part.
  const custom =
    error.message.match(/Error:\s*([A-Za-z]+)\(/) ??
    error.message.match(/reverted with the following reason:\s*\n\s*([A-Za-z]+)/) ??
    error.message.match(/custom error '([A-Za-z]+)/);
  if (custom) return `Contract rejected the call: ${custom[1]}`;
  return first.slice(0, 300);
}
