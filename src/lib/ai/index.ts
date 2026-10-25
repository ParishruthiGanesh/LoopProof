import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { imageAnalysisSchema, semanticMatchSchema, type ImageAnalysis, type SemanticMatch } from "./schema";
import {
  IMAGE_ANALYSIS_SYSTEM_PROMPT,
  imageAnalysisUserPrompt,
  SEMANTIC_MATCH_SYSTEM_PROMPT,
} from "./prompts";
import { EXAMPLE_ANALYSES, findExample } from "./examples";
import { serverEnv, aiLiveEnabled } from "../env";

export * from "./schema";
export { EXAMPLE_ANALYSES, findExample };

export type AiMode = "live" | "example" | "unavailable";

export type AiStatus = {
  liveEnabled: boolean;
  model: string;
  /** Exactly what the operator must do to switch live analysis on. */
  enableInstructions: string;
  exampleCount: number;
};

export function aiStatus(): AiStatus {
  return {
    liveEnabled: aiLiveEnabled(),
    model: serverEnv.anthropicModel,
    enableInstructions:
      "Set ANTHROPIC_API_KEY in .env.local (optionally LOOPPROOF_AI_MODEL) and restart the dev server. Listing creation works without it.",
    exampleCount: EXAMPLE_ANALYSES.length,
  };
}

export type AnalysisOutcome =
  | { ok: true; mode: "live"; analysis: ImageAnalysis; model: string; latencyMs: number }
  | {
      ok: true;
      mode: "example";
      analysis: ImageAnalysis;
      exampleKey: string;
      exampleLabel: string;
      exampleDescribes: string;
    }
  | { ok: false; mode: AiMode; error: string; retryable: boolean };

export type PhotoInput = {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  sha256: string;
};

/**
 * Real server-side image analysis. Returns a validated structured draft or an
 * honest failure. Never fabricates a result, and never claims that an upload
 * was analysed when it was not.
 */
export async function analyzePhotos(
  photos: PhotoInput[],
  ownerHint = "",
): Promise<AnalysisOutcome> {
  if (!aiLiveEnabled()) {
    return {
      ok: false,
      mode: "unavailable",
      error:
        "No ANTHROPIC_API_KEY is configured, so these photographs were not analysed. Fill the listing in manually, or load a labelled example analysis to see the shape of the output.",
      retryable: false,
    };
  }
  if (photos.length === 0) {
    return { ok: false, mode: "live", error: "No photographs supplied.", retryable: false };
  }

  const client = new Anthropic({
    apiKey: serverEnv.anthropicApiKey,
    timeout: serverEnv.aiTimeoutMs,
    maxRetries: 1,
  });

  const startedAt = Date.now();
  try {
    const response = await client.messages.create({
      model: serverEnv.anthropicModel,
      max_tokens: 2048,
      system: IMAGE_ANALYSIS_SYSTEM_PROMPT,
      tools: [
        {
          name: "submit_draft_listing",
          description: "Return the structured draft listing for the photographed item.",
          input_schema: imageAnalysisJsonSchema,
        },
      ],
      tool_choice: { type: "tool", name: "submit_draft_listing" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: imageAnalysisUserPrompt(photos.length, ownerHint) },
            ...photos.map(
              (p) =>
                ({
                  type: "image",
                  source: { type: "base64", media_type: p.mediaType, data: p.base64 },
                }) as Anthropic.ImageBlockParam,
            ),
          ],
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return {
        ok: false,
        mode: "live",
        error: "The model did not return structured output. Nothing was saved.",
        retryable: true,
      };
    }

    const parsed = imageAnalysisSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      return {
        ok: false,
        mode: "live",
        error: `The model's output did not match the required schema, so it was discarded: ${formatZodError(parsed.error)}`,
        retryable: true,
      };
    }

    return {
      ok: true,
      mode: "live",
      analysis: parsed.data,
      model: serverEnv.anthropicModel,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return { ok: false, mode: "live", error: describeAiError(error), retryable: true };
  }
}

export type ExampleOutcome =
  | {
      ok: true;
      mode: "example";
      analysis: ImageAnalysis;
      exampleKey: string;
      exampleLabel: string;
      exampleDescribes: string;
    }
  | { ok: false; mode: "example"; error: string; retryable: false };

/** Loads one named prerecorded example. Clearly labelled by the caller. */
export function loadExampleAnalysis(key: string): ExampleOutcome {
  const example = findExample(key);
  if (!example) {
    return { ok: false, mode: "example", error: `No example analysis named "${key}".`, retryable: false };
  }
  const parsed = imageAnalysisSchema.safeParse(example.analysis);
  if (!parsed.success) {
    return { ok: false, mode: "example", error: "Built-in example failed validation.", retryable: false };
  }
  return {
    ok: true,
    mode: "example",
    analysis: parsed.data,
    exampleKey: example.key,
    exampleLabel: example.label,
    exampleDescribes: example.describes,
  };
}

/* ------------------------------------------------------- semantic matching */

export type SemanticOutcome =
  | { ok: true; result: SemanticMatch }
  | { ok: false; error: string };

export async function semanticRankCandidates(input: {
  requestTitle: string;
  requestFreeText: string;
  candidates: Array<{ itemId: string; title: string; description: string; conditionGrade: string; specs: string[] }>;
}): Promise<SemanticOutcome> {
  if (!aiLiveEnabled()) {
    return { ok: false, error: "Semantic ranking needs ANTHROPIC_API_KEY; rule-based ranking was used instead." };
  }
  if (input.candidates.length === 0) return { ok: true, result: { rankedItemIds: [], notes: [], interpretationOfRequest: "" } };

  const client = new Anthropic({
    apiKey: serverEnv.anthropicApiKey,
    timeout: serverEnv.aiTimeoutMs,
    maxRetries: 1,
  });

  const candidateBlock = input.candidates
    .map(
      (c) =>
        `- id: ${c.itemId}\n  title: ${c.title}\n  condition: ${c.conditionGrade}\n  confirmed specifications: ${c.specs.join("; ") || "none recorded"}\n  description: ${c.description.slice(0, 400)}`,
    )
    .join("\n");

  try {
    const response = await client.messages.create({
      model: serverEnv.anthropicModel,
      max_tokens: 1500,
      system: SEMANTIC_MATCH_SYSTEM_PROMPT,
      tools: [
        {
          name: "submit_ranking",
          description: "Return the ranking and the reasons for it.",
          input_schema: semanticMatchJsonSchema,
        },
      ],
      tool_choice: { type: "tool", name: "submit_ranking" },
      messages: [
        {
          role: "user",
          content: `<untrusted_request_text>
Recipient's request title: ${input.requestTitle}
Recipient's own words: ${input.requestFreeText.slice(0, 1500)}
</untrusted_request_text>

<untrusted_candidate_items>
${candidateBlock}
</untrusted_candidate_items>

Rank the candidate ids and explain each one.`,
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return { ok: false, error: "No structured ranking returned." };

    const parsed = semanticMatchSchema.safeParse(toolUse.input);
    if (!parsed.success) return { ok: false, error: `Ranking failed validation: ${formatZodError(parsed.error)}` };

    // Discard any id the model did not receive.
    const allowed = new Set(input.candidates.map((c) => c.itemId));
    const result: SemanticMatch = {
      interpretationOfRequest: parsed.data.interpretationOfRequest,
      rankedItemIds: parsed.data.rankedItemIds.filter((id) => allowed.has(id)),
      notes: parsed.data.notes.filter((n) => allowed.has(n.itemId)),
    };
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: describeAiError(error) };
  }
}

/* ------------------------------------------------------------------ helpers */

function formatZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 4)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

function describeAiError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 401) return "The configured ANTHROPIC_API_KEY was rejected. Nothing was saved.";
    if (error.status === 429) return "The model API is rate limiting requests. Try again shortly, or fill the listing in manually.";
    if (error.status && error.status >= 500) return "The model API returned a server error. Try again, or fill the listing in manually.";
    return `Model API error (${error.status ?? "unknown"}): ${error.message.slice(0, 200)}`;
  }
  if (error instanceof Error && /timeout|aborted|ETIMEDOUT/i.test(error.message)) {
    return `Analysis timed out after ${Math.round(serverEnv.aiTimeoutMs / 1000)}s. Nothing was saved; fill the listing in manually or try again.`;
  }
  return error instanceof Error ? error.message.slice(0, 250) : String(error);
}

/* The tool input schemas, kept beside the zod schemas they mirror. */

const imageAnalysisJsonSchema = {
  type: "object",
  required: ["suggestedCategory", "suggestedTitle", "visibleBrand", "visibleModel", "draftDescription"],
  properties: {
    suggestedCategory: {
      type: "string",
      enum: ["monitor", "peripheral", "small_electronics", "networking", "furniture", "other", "unknown"],
    },
    suggestedTitle: { type: "string", description: "Short, factual listing title, 3-90 characters." },
    visibleBrand: { type: "string", description: 'Brand legible in the photo, or "unknown".' },
    visibleModel: { type: "string", description: 'Model legible in the photo, or "unknown".' },
    visibleSpecifications: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        required: ["label", "value", "evidence"],
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          evidence: { type: "string", description: "Where in the image this was read from." },
        },
      },
    },
    visibleDamage: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        required: ["observation", "severityWording"],
        properties: {
          observation: { type: "string", description: "Visible appearance only, never a functional verdict." },
          location: { type: "string" },
          severityWording: { type: "string", enum: ["cosmetic", "possible_functional", "unclear"] },
        },
      },
    },
    uncertainFields: { type: "array", maxItems: 15, items: { type: "string" } },
    questionsForOwner: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        required: ["question"],
        properties: {
          question: { type: "string" },
          field: {
            type: "string",
            enum: ["category", "title", "brand", "model", "specifications", "condition", "defects", "mass", "cables", "quantity", "other"],
          },
          whyItMatters: { type: "string" },
        },
      },
    },
    draftDescription: { type: "string", description: "Two to four sentences. No claims about functionality." },
    notAssessableFromPhoto: { type: "array", maxItems: 10, items: { type: "string" } },
  },
} satisfies Anthropic.Tool["input_schema"];

const semanticMatchJsonSchema = {
  type: "object",
  required: ["rankedItemIds", "notes"],
  properties: {
    rankedItemIds: { type: "array", maxItems: 25, items: { type: "string" } },
    notes: {
      type: "array",
      maxItems: 25,
      items: {
        type: "object",
        required: ["itemId", "reason"],
        properties: {
          itemId: { type: "string" },
          reason: { type: "string" },
          missingInformation: { type: "array", maxItems: 6, items: { type: "string" } },
        },
      },
    },
    interpretationOfRequest: { type: "string" },
  },
} satisfies Anthropic.Tool["input_schema"];
