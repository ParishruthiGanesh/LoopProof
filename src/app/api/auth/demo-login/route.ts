import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { errorResponse, ok, parseJson } from "@/lib/api";

const bodySchema = z.object({ userId: z.string().trim().min(1).max(100) });

/**
 * Demo-account entry. This creates a real server-side session for that user,
 * exactly as the password form does. It does not switch the interface while
 * leaving the backend thinking someone else is signed in: every subsequent
 * permission check reads the session's own organization.
 *
 * Only accounts seeded as demonstration accounts can be entered this way.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await parseJson(request, bodySchema);
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, userId), eq(schema.users.isDemo, true)))
      .limit(1);
    const user = rows[0];
    if (!user) return ok({ error: "That demonstration account does not exist." }, 404);

    await createSession(user.id);
    return ok({ ok: true, orgId: user.orgId });
  } catch (error) {
    return errorResponse(error);
  }
}
