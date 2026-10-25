import { z } from "zod";
import { requireSessionUser, canDonate, ForbiddenError } from "@/lib/auth";
import { getSqlite } from "@/lib/db";
import { newItemId, uuid } from "@/lib/ids";
import { validateUploads, storePhoto, MAX_PHOTOS } from "@/lib/uploads";
import { publishItem } from "@/lib/items";
import { errorResponse, ok } from "@/lib/api";

export const maxDuration = 60;

const CATEGORIES = ["monitor", "peripheral", "small_electronics", "networking", "furniture", "other"] as const;
const CONDITIONS = ["working_good", "working_marks", "working_defects", "untested", "parts_only"] as const;

/**
 * Every field the owner publishes is validated here. AI suggestions arrive as
 * ordinary form values that the owner has already reviewed in the browser;
 * each confirmed specification records whether its basis was a documented test
 * or the owner's own report. A suggestion the owner did not confirm is stored
 * as ai_suggested_unconfirmed and is excluded from the public manifest.
 */
const specSchema = z.object({
  label: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(160),
  source: z.enum(["owner_reported", "documented_test", "ai_suggested_unconfirmed"]),
  basis: z.string().trim().max(240).default(""),
  confirmed: z.boolean(),
});

const bodySchema = z.object({
  title: z.string().trim().min(5).max(120),
  category: z.enum(CATEGORIES),
  description: z.string().trim().min(10).max(2000),
  brand: z.string().trim().max(80).default("unknown"),
  model: z.string().trim().max(80).default("unknown"),
  conditionGrade: z.enum(CONDITIONS),
  quantity: z.coerce.number().int().min(1).max(500),
  massKg: z.coerce.number().positive().max(500).nullable(),
  massBasis: z.enum(["measured", "estimated", "unknown"]),
  replacementValue: z.coerce.number().nonnegative().max(1_000_000).nullable(),
  replacementValueBasis: z.enum(["owner_estimate", "quoted_evidence", "unknown"]),
  locationRegion: z.string().trim().min(2).max(120),
  collectionAddress: z.string().trim().max(300).default(""),
  collectionWindowStart: z.string().trim().max(40).nullable(),
  collectionWindowEnd: z.string().trim().max(40).nullable(),
  knownDefects: z.string().trim().max(1200).default(""),
  privateNotes: z.string().trim().max(1200).default(""),
  specs: z.array(specSchema).max(20).default([]),
  checklist: z.object({
    powersOn: z.enum(["pass", "fail", "not_tested", "not_applicable"]),
    displayWorks: z.enum(["pass", "fail", "not_tested", "not_applicable"]),
    portsTested: z.enum(["pass", "fail", "partial", "not_tested", "not_applicable"]),
    cablesIncluded: z.enum(["yes", "no", "partial"]),
    notes: z.string().trim().max(600).default(""),
  }),
  ownerStatement: z.string().trim().max(600).default(""),
  aiAnalysisMode: z.enum(["live", "example", "none"]).default("none"),
  aiAnalysisExampleKey: z.string().trim().max(80).nullable().default(null),
  publish: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    if (!canDonate(user)) {
      throw new ForbiddenError("Only a donating organization can create listings.");
    }

    const form = await request.formData();
    const files = form.getAll("photos").filter((f): f is File => f instanceof File);
    if (files.length > MAX_PHOTOS) {
      return ok({ error: `Attach at most ${MAX_PHOTOS} photographs.` }, 400);
    }

    const rawPayload = form.get("payload");
    if (typeof rawPayload !== "string") {
      return ok({ error: "Missing listing payload." }, 400);
    }
    const body = bodySchema.parse(JSON.parse(rawPayload));

    // Mass must be a number or explicitly unknown; it is never inferred.
    if (body.massKg != null && body.massBasis === "unknown") {
      return ok(
        { error: "A weight was entered, so say whether it was measured or is an estimate." },
        422,
      );
    }
    if (body.massKg == null && body.massBasis !== "unknown") {
      return ok({ error: "No weight was entered, so its basis must be 'unknown'." }, 422);
    }
    if (body.replacementValue != null && body.replacementValueBasis === "unknown") {
      return ok({ error: "A replacement value was entered, so say what it is based on." }, 422);
    }

    const photos = files.length > 0 ? await validateUploads(files) : [];
    const itemId = newItemId(body.category);
    const now = new Date().toISOString();
    const sqlite = getSqlite();

    const stored = photos.map((photo) => ({ photo, ...storePhoto(photo) }));

    sqlite.transaction(() => {
      sqlite
        .prepare(
          `INSERT INTO items (id, org_id, title, category, description, brand, model, condition_grade, quantity,
             mass_kg, mass_basis, replacement_value, replacement_value_basis, location_region, collection_address,
             collection_window_start, collection_window_end, known_defects, private_notes, status,
             evidence_version, is_demo, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',0,0,?,?)`,
        )
        .run(
          itemId,
          user.orgId,
          body.title,
          body.category,
          body.description,
          body.brand || "unknown",
          body.model || "unknown",
          body.conditionGrade,
          body.quantity,
          body.massKg,
          body.massBasis,
          body.replacementValue,
          body.replacementValueBasis,
          body.locationRegion,
          body.collectionAddress,
          body.collectionWindowStart || null,
          body.collectionWindowEnd || null,
          body.knownDefects,
          body.privateNotes,
          now,
          now,
        );

      stored.forEach((entry, index) => {
        sqlite
          .prepare(
            `INSERT INTO item_photos (id, item_id, stored_path, sha256, caption, mime_type, byte_size, is_public, sort_order, created_at)
             VALUES (?,?,?,?,?,?,?,1,?,?)`,
          )
          .run(
            uuid(),
            itemId,
            entry.storedPath,
            entry.photo.sha256,
            index === 0 ? "Photograph supplied by the owner" : `Additional photograph ${index + 1}`,
            entry.photo.mimeType,
            entry.photo.byteSize,
            index,
            now,
          );
      });

      body.specs.forEach((spec, index) => {
        sqlite
          .prepare(
            `INSERT INTO item_specs (id, item_id, label, value, source, confirmed_by_owner, basis, sort_order)
             VALUES (?,?,?,?,?,?,?,?)`,
          )
          .run(
            uuid(),
            itemId,
            spec.label,
            spec.value,
            spec.confirmed ? spec.source : "ai_suggested_unconfirmed",
            spec.confirmed ? 1 : 0,
            spec.basis,
            index,
          );
      });

      sqlite
        .prepare(
          `INSERT INTO test_checklists (item_id, powers_on, display_works, ports_tested, cables_included, notes, tested_by_org_id, tested_at)
           VALUES (?,?,?,?,?,?,?,?)`,
        )
        .run(
          itemId,
          body.checklist.powersOn,
          body.checklist.displayWorks,
          body.checklist.portsTested,
          body.checklist.cablesIncluded,
          body.checklist.notes,
          user.orgId,
          now,
        );

      const tested = [body.checklist.powersOn, body.checklist.displayWorks, body.checklist.portsTested].some(
        (v) => v === "pass" || v === "fail" || v === "partial",
      );
      sqlite
        .prepare(
          `INSERT INTO condition_evidence (id, item_id, kind, source, statement, recorded_by_org_id, is_public, recorded_at)
           VALUES (?,?,'test_checklist',?,?,?,1,?)`,
        )
        .run(
          uuid(),
          itemId,
          tested ? "documented_test" : "owner_reported",
          buildChecklistStatement(body.checklist, tested),
          user.orgId,
          now,
        );

      if (body.ownerStatement.trim()) {
        sqlite
          .prepare(
            `INSERT INTO condition_evidence (id, item_id, kind, source, statement, recorded_by_org_id, is_public, recorded_at)
             VALUES (?,?,'owner_statement','owner_reported',?,?,1,?)`,
          )
          .run(uuid(), itemId, body.ownerStatement.trim(), user.orgId, now);
      }

      if (body.knownDefects.trim()) {
        sqlite
          .prepare(
            `INSERT INTO condition_evidence (id, item_id, kind, source, statement, recorded_by_org_id, is_public, recorded_at)
             VALUES (?,?,'defect_report','owner_reported',?,?,1,?)`,
          )
          .run(uuid(), itemId, `Known defects reported by the owner: ${body.knownDefects.trim()}`, user.orgId, now);
      }
    })();

    // Link the most recent unattached analysis to the item it produced.
    if (body.aiAnalysisMode !== "none") {
      sqlite
        .prepare(
          `UPDATE ai_analyses SET item_id = ?
             WHERE id = (SELECT id FROM ai_analyses WHERE item_id IS NULL ORDER BY created_at DESC LIMIT 1)`,
        )
        .run(itemId);
    }

    let anchorStatus: string | null = null;
    let anchorError: string | null = null;
    let evidenceVersion = 0;
    let evidenceSha256: string | null = null;

    if (body.publish) {
      const result = await publishItem(itemId, user.orgId);
      anchorStatus = result.anchorResult.status;
      anchorError = result.anchorResult.error;
      evidenceVersion = result.snapshot.versionNumber;
      evidenceSha256 = result.snapshot.sha256;
    }

    return ok(
      {
        ok: true,
        itemId,
        published: body.publish,
        evidenceVersion,
        evidenceSha256,
        anchorStatus,
        anchorError,
        passportUrl: `/passport/${itemId}`,
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function buildChecklistStatement(
  checklist: {
    powersOn: string;
    displayWorks: string;
    portsTested: string;
    cablesIncluded: string;
    notes: string;
  },
  tested: boolean,
): string {
  const word = (v: string) =>
    ({
      pass: "passed",
      fail: "failed",
      partial: "partially tested",
      not_tested: "not tested",
      not_applicable: "not applicable",
      yes: "included",
      no: "not included",
    })[v] ?? v;

  const parts = [
    `Powers on: ${word(checklist.powersOn)}`,
    `Display: ${word(checklist.displayWorks)}`,
    `Ports: ${word(checklist.portsTested)}`,
    `Cables: ${word(checklist.cablesIncluded)}`,
  ];
  const lead = tested
    ? "Testing checklist recorded by the owner"
    : "Testing checklist recorded by the owner (nothing was actually tested)";
  return `${lead}. ${parts.join(". ")}.${checklist.notes.trim() ? ` Notes: ${checklist.notes.trim()}` : ""}`;
}
