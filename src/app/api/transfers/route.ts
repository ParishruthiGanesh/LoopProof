import { z } from "zod";
import { requireSessionUser, canReceive, ForbiddenError } from "@/lib/auth";
import { submitRequest } from "@/lib/transfers";
import { errorResponse, ok } from "@/lib/api";

const bodySchema = z.object({
  itemId: z.string().trim().min(3).max(40),
  requestId: z.string().trim().max(40).nullable().default(null),
  message: z.string().trim().min(5).max(1000),
  quantity: z.coerce.number().int().min(1).max(500),
});

/** Recipient submits a request against a listing. */
export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    if (!canReceive(user)) {
      throw new ForbiddenError("Only a receiving organization can request an item.");
    }
    const body = bodySchema.parse(await request.json());

    const { transferId } = submitRequest({
      itemId: body.itemId,
      recipientOrgId: user.orgId,
      requestId: body.requestId,
      message: body.message,
      quantity: body.quantity,
    });

    return ok({ ok: true, transferId }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
