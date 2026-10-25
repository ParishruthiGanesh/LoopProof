import { z } from "zod";

/**
 * The structured output we require from the image-analysis model. Every field
 * is validated before anything is written to the database, and every suggestion
 * reaches the listing only after the owner confirms it.
 */

export const unknownableString = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v.length === 0 ? "unknown" : v));

export const visibleSpecSchema = z.object({
  label: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(120),
  /** Where in the photo this was read from. */
  evidence: z.string().trim().min(1).max(240),
});

export const damageObservationSchema = z.object({
  observation: z.string().trim().min(1).max(240),
  location: z.string().trim().max(120).default(""),
  severityWording: z.enum(["cosmetic", "possible_functional", "unclear"]),
});

export const ownerQuestionSchema = z.object({
  question: z.string().trim().min(1).max(240),
  field: z
    .enum([
      "category",
      "title",
      "brand",
      "model",
      "specifications",
      "condition",
      "defects",
      "mass",
      "cables",
      "quantity",
      "other",
    ])
    .default("other"),
  whyItMatters: z.string().trim().max(240).default(""),
});

export const imageAnalysisSchema = z.object({
  suggestedCategory: z.enum([
    "monitor",
    "peripheral",
    "small_electronics",
    "networking",
    "furniture",
    "other",
    "unknown",
  ]),
  suggestedTitle: z.string().trim().min(3).max(90),
  visibleBrand: unknownableString,
  visibleModel: unknownableString,
  visibleSpecifications: z.array(visibleSpecSchema).max(12).default([]),
  visibleDamage: z.array(damageObservationSchema).max(10).default([]),
  uncertainFields: z.array(z.string().trim().max(120)).max(15).default([]),
  questionsForOwner: z.array(ownerQuestionSchema).max(8).default([]),
  draftDescription: z.string().trim().min(10).max(900),
  /** The model must restate that it cannot judge these from a photograph. */
  notAssessableFromPhoto: z.array(z.string().trim().max(160)).max(10).default([]),
});

export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>;

/** Semantic matching output: ordering and prose only, never a made-up score. */
export const semanticMatchSchema = z.object({
  rankedItemIds: z.array(z.string().trim().max(40)).max(25).default([]),
  notes: z
    .array(
      z.object({
        itemId: z.string().trim().max(40),
        /** Why this item fits the plain-language request. */
        reason: z.string().trim().min(1).max(280),
        /** What the request does not say that a donor would need to know. */
        missingInformation: z.array(z.string().trim().max(160)).max(6).default([]),
      }),
    )
    .max(25)
    .default([]),
  interpretationOfRequest: z.string().trim().max(600).default(""),
});

export type SemanticMatch = z.infer<typeof semanticMatchSchema>;
