import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { applyTransferAction } from "@/lib/transfers";
import { errorResponse, ok } from "@/lib/api";

export const maxDuration = 60;

const bodySchema = z.object({
  action: z.enum(["accept", "decline", "withdraw", "cancel", "record_release", "record_receipt", "report_problem"]),
  note: z.string().trim().max(500).default(""),
  conditionConfirmed: z.boolean().optional(),
});

/**
 * The single entry point for every transfer state change. Role and transition
 * are both decided server-side from the session; the client cannot name a
 * target state.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSessionUser();
    const body = bodySchema.parse(await request.json());

    if (body.action === "report_problem" && body.note.trim().length < 5) {
      return ok({ error: "Describe the problem before reporting it." }, 422);
    }
    if (body.action === "record_receipt" && body.conditionConfirmed === undefined) {
      return ok(
        { error: "Say whether the item matched the published condition, or report a problem instead." },
        422,
      );
    }

    const outcome = await applyTransferAction({
      transferId: id,
      action: body.action,
      user,
      note: body.note,
      conditionConfirmed: body.conditionConfirmed,
    });

    return ok({
      ok: true,
      fromState: outcome.fromState,
      toState: outcome.toState,
      supersededTransferIds: outcome.supersededTransferIds,
      anchor: outcome.anchorResult
        ? {
            status: outcome.anchorResult.status,
            txHash: outcome.anchorResult.txHash,
            blockNumber: outcome.anchorResult.blockNumber,
            error: outcome.anchorResult.error,
            deduplicated: outcome.anchorResult.deduplicated,
          }
        : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
