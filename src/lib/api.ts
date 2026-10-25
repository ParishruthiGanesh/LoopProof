import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AuthError, ForbiddenError } from "./auth";
import { UploadError } from "./uploads";
import { WorkflowError } from "./transfers";

export type ApiFailure = { error: string; details?: unknown };

/** One place where every API error becomes an honest status + message. */
export function errorResponse(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "The submitted data was not valid.",
        details: error.issues.map((i) => ({ field: i.path.join(".") || "(root)", message: i.message })),
      },
      { status: 422 },
    );
  }
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 401 });
  if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof WorkflowError) return NextResponse.json({ error: error.message }, { status: 409 });

  console.error("[loopproof] unhandled API error:", error);
  return NextResponse.json(
    { error: "Something went wrong on the server. Nothing was saved." },
    { status: 500 },
  );
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ZodError([
      { code: "custom", path: [], message: "Request body must be valid JSON." },
    ]);
  }
  return schema.parse(body);
}

export const ok = <T>(data: T, status = 200) => NextResponse.json(data, { status });
