/**
 * Single place where server configuration is read. Everything here is
 * server-only: nothing in this file may be imported into a client component.
 */

const str = (name: string, fallback = "") => process.env[name]?.trim() || fallback;

export const serverEnv = {
  databaseUrl: str("LOOPPROOF_DATABASE_PATH", "data/loopproof.db"),
  uploadDir: str("LOOPPROOF_UPLOAD_DIR", "data/uploads"),
  sessionSecret: str("LOOPPROOF_SESSION_SECRET", "dev-only-insecure-session-secret-change-me"),

  // --- AI -----------------------------------------------------------------
  anthropicApiKey: str("ANTHROPIC_API_KEY"),
  anthropicModel: str("LOOPPROOF_AI_MODEL", "claude-sonnet-4-5"),
  aiTimeoutMs: Number(str("LOOPPROOF_AI_TIMEOUT_MS", "45000")),

  // --- chain --------------------------------------------------------------
  rpcUrl: str("LOOPPROOF_RPC_URL", "http://127.0.0.1:8545"),
  chainId: Number(str("LOOPPROOF_CHAIN_ID", "31337")),
  contractAddress: str("LOOPPROOF_CONTRACT_ADDRESS"),
  chainLabel: str("LOOPPROOF_CHAIN_LABEL", "Local development chain (Hardhat, chainId 31337)"),
  /** Explicit opt-in. Without it, nothing is ever labelled "simulated". */
  simulationMode: str("LOOPPROOF_CHAIN_SIMULATION", "false") === "true",

  publicBaseUrl: str("LOOPPROOF_PUBLIC_BASE_URL", "http://localhost:3000"),
} as const;

/** True when a real model call is possible. */
export const aiLiveEnabled = () => serverEnv.anthropicApiKey.length > 0;

/** True when the backend has somewhere to anchor evidence. */
export const chainConfigured = () => serverEnv.contractAddress.length > 0;

export const sessionSecretIsDefault = () =>
  serverEnv.sessionSecret === "dev-only-insecure-session-secret-change-me";
