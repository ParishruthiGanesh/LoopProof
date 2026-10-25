import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "./db";
import { serverEnv } from "./env";
import { hashPassword, verifyPassword } from "./password";

const COOKIE_NAME = "loopproof_session";
const SESSION_DAYS = 7;

export { hashPassword, verifyPassword };

/* -------------------------------------------------------------- cookies */

/** The cookie carries `<sessionId>.<hmac>`, so a forged id is rejected before
 *  it ever reaches the database. */
function sign(sessionId: string): string {
  const mac = createHmac("sha256", serverEnv.sessionSecret).update(sessionId).digest("base64url");
  return `${sessionId}.${mac}`;
}

function unsign(token: string): string | null {
  const index = token.lastIndexOf(".");
  if (index <= 0) return null;
  const sessionId = token.slice(0, index);
  const provided = Buffer.from(token.slice(index + 1));
  const expected = Buffer.from(
    createHmac("sha256", serverEnv.sessionSecret).update(sessionId).digest("base64url"),
  );
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  return sessionId;
}

/* ------------------------------------------------------------- sessions */

export type SessionUser = {
  userId: string;
  name: string;
  email: string;
  role: "staff" | "admin";
  orgId: string;
  orgName: string;
  orgKind: "donor" | "recipient" | "both";
  orgWalletAddress: string | null;
  orgLocationRegion: string;
  isDemo: boolean;
};

export async function createSession(userId: string): Promise<void> {
  const db = getDb();
  const sessionId = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({
    id: sessionId,
    userId,
    expiresAt: expiresAt.toISOString(),
  });
  const store = await cookies();
  store.set(COOKIE_NAME, sign(sessionId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    const sessionId = unsign(token);
    if (sessionId) await getDb().delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
  }
  store.delete(COOKIE_NAME);
}

/** The authoritative server-side identity. UI never supplies the org id. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const sessionId = unsign(token);
  if (!sessionId) return null;

  const db = getDb();
  const rows = await db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      orgId: schema.organizations.id,
      orgName: schema.organizations.name,
      orgKind: schema.organizations.kind,
      orgWalletAddress: schema.organizations.walletAddress,
      orgLocationRegion: schema.organizations.locationRegion,
      isDemo: schema.users.isDemo,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.users.orgId))
    .where(and(eq(schema.sessions.id, sessionId), gt(schema.sessions.expiresAt, new Date().toISOString())))
    .limit(1);

  return rows[0] ?? null;
}

export class AuthError extends Error {
  status = 401;
  constructor(message = "Sign in to continue.") {
    super(message);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Your organization is not permitted to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError();
  return user;
}

/** Organization-level authorisation, checked on the server for every write. */
export function requireOrg(user: SessionUser, orgId: string, message?: string): void {
  if (user.orgId !== orgId) throw new ForbiddenError(message);
}

export function requireAnyOrg(user: SessionUser, orgIds: string[], message?: string): void {
  if (!orgIds.includes(user.orgId)) throw new ForbiddenError(message);
}

export function canDonate(user: SessionUser): boolean {
  return user.orgKind === "donor" || user.orgKind === "both";
}

export function canReceive(user: SessionUser): boolean {
  return user.orgKind === "recipient" || user.orgKind === "both";
}

export async function purgeExpiredSessions(): Promise<void> {
  const db = getDb();
  await db.delete(schema.sessions).where(gt(new Date().toISOString() as never, schema.sessions.expiresAt));
}
