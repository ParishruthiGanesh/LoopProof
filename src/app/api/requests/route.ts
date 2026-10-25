import { z } from "zod";
import { requireSessionUser, canReceive, ForbiddenError } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newRequestId } from "@/lib/ids";
import { eq } from "drizzle-orm";
import { errorResponse, ok } from "@/lib/api";

const bodySchema = z.object({
  title: z.string().trim().min(5).max(140),
  freeText: z.string().trim().min(10).max(2000),
  category: z.enum(["monitor", "peripheral", "small_electronics", "networking", "furniture", "other"]),
  quantity: z.coerce.number().int().min(1).max(500),
  minConditionGrade: z.enum(["working_good", "working_marks", "working_defects", "untested", "parts_only"]),
  requiredSpecs: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        value: z.string().trim().min(1).max(120),
        required: z.boolean(),
      }),
    )
    .max(10)
    .default([]),
  maxDistanceKm: z.coerce.number().positive().max(2000).nullable(),
  collectionDeadline: z.string().trim().max(40).nullable(),
  needsCablesIncluded: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    if (!canReceive(user)) {
      throw new ForbiddenError("Only a receiving organization can post a request.");
    }

    const body = bodySchema.parse(await request.json());
    const db = getDb();

    const orgRows = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.orgId))
      .limit(1);
    const org = orgRows[0];

    const id = newRequestId();
    await db.insert(schema.requests).values({
      id,
      orgId: user.orgId,
      title: body.title,
      freeText: body.freeText,
      category: body.category,
      quantity: body.quantity,
      minConditionGrade: body.minConditionGrade,
      requiredSpecs: JSON.stringify(body.requiredSpecs),
      locationRegion: org?.locationRegion ?? "",
      latitude: org?.latitude ?? null,
      longitude: org?.longitude ?? null,
      maxDistanceKm: body.maxDistanceKm,
      collectionDeadline: body.collectionDeadline || null,
      needsCablesIncluded: body.needsCablesIncluded,
      status: "open",
      isDemo: false,
    });

    return ok({ ok: true, requestId: id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
