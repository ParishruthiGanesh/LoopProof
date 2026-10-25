import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { errorResponse, ok, parseJson } from "@/lib/api";

const bodySchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    const { email, password } = await parseJson(request, bodySchema);
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);
    const user = rows[0];

    // Same message either way, so the response does not reveal which
    // addresses exist.
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return ok({ error: "Those sign-in details were not recognised." }, 401);
    }

    await createSession(user.id);
    return ok({ ok: true, orgId: user.orgId });
  } catch (error) {
    return errorResponse(error);
  }
}
