import { z } from "zod";
import { requireSessionUser, canDonate, ForbiddenError } from "@/lib/auth";
import { validateUploads } from "@/lib/uploads";
import { analyzePhotos, aiStatus } from "@/lib/ai";
import { getDb, schema } from "@/lib/db";
import { uuid } from "@/lib/ids";
import { errorResponse, ok } from "@/lib/api";

export const maxDuration = 60;

/**
 * Real server-side image analysis. The API key never leaves the server, and
 * nothing is written to a listing here: the response is a draft for the owner
 * to confirm, field by field.
 */
export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    if (!canDonate(user)) {
      throw new ForbiddenError("Only a donating organization can create listings.");
    }

    const form = await request.formData();
    const files = form.getAll("photos").filter((f): f is File => f instanceof File);
    const ownerHint = z.string().max(500).catch("").parse(form.get("ownerHint") ?? "");

    const photos = await validateUploads(files);
    const outcome = await analyzePhotos(
      photos.map((p) => ({
        base64: p.buffer.toString("base64"),
        mediaType: p.mimeType,
        sha256: p.sha256,
      })),
      ownerHint,
    );

    const db = getDb();
    await db.insert(schema.aiAnalyses).values({
      id: uuid(),
      mode: outcome.ok ? outcome.mode : outcome.mode,
      model: outcome.ok && outcome.mode === "live" ? outcome.model : "",
      exampleKey: outcome.ok && outcome.mode === "example" ? outcome.exampleKey : null,
      photoHashes: JSON.stringify(photos.map((p) => p.sha256)),
      outputJson: outcome.ok ? JSON.stringify(outcome.analysis) : "{}",
      validationError: outcome.ok ? "" : outcome.error,
      latencyMs: outcome.ok && outcome.mode === "live" ? outcome.latencyMs : null,
    });

    if (!outcome.ok) {
      return ok(
        {
          ok: false,
          mode: outcome.mode,
          error: outcome.error,
          retryable: outcome.retryable,
          status: aiStatus(),
        },
        outcome.mode === "unavailable" ? 200 : 502,
      );
    }

    return ok({
      ok: true,
      mode: outcome.mode,
      analysis: outcome.analysis,
      model: outcome.mode === "live" ? outcome.model : null,
      latencyMs: outcome.mode === "live" ? outcome.latencyMs : null,
      photoDigests: photos.map((p) => p.sha256),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
