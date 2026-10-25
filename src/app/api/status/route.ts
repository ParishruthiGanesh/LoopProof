import { aiStatus } from "@/lib/ai";
import { rpcHealth } from "@/lib/chain";
import { sessionSecretIsDefault } from "@/lib/env";
import { errorResponse, ok } from "@/lib/api";

/** Honest, machine-readable statement of what is live in this deployment. */
export async function GET() {
  try {
    const chain = await rpcHealth();
    return ok({
      ai: aiStatus(),
      chain,
      warnings: sessionSecretIsDefault()
        ? ["LOOPPROOF_SESSION_SECRET is still the development default. Set it before any shared deployment."]
        : [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
