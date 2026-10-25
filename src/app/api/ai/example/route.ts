import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { EXAMPLE_ANALYSES, loadExampleAnalysis } from "@/lib/ai";
import { errorResponse, ok, parseJson } from "@/lib/api";

const bodySchema = z.object({ exampleKey: z.string().trim().min(1).max(80) });

/** Returns one named prerecorded example. The caller is told plainly that no
 *  model call was made and which example this is. */
export async function POST(request: Request) {
  try {
    await requireSessionUser();
    const { exampleKey } = await parseJson(request, bodySchema);
    const outcome = loadExampleAnalysis(exampleKey);
    if (!outcome.ok) return ok({ ok: false, error: outcome.error }, 404);
    return ok({
      ok: true,
      mode: "example" as const,
      analysis: outcome.analysis,
      exampleKey: outcome.exampleKey,
      exampleLabel: outcome.exampleLabel,
      exampleDescribes: outcome.exampleDescribes,
      disclaimer:
        "This is a prerecorded example analysis shipped with LoopProof. Your uploaded photographs were not analysed by any model.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
  return ok({
    examples: EXAMPLE_ANALYSES.map((e) => ({ key: e.key, label: e.label, describes: e.describes })),
  });
}
