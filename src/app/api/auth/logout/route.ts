import { destroySession } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/api";

export async function POST() {
  try {
    await destroySession();
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
