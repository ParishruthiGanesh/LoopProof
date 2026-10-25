import Link from "next/link";
import { and, eq, inArray, like, or, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { photoUrl } from "@/lib/uploads";
import { labelCategory, labelCondition } from "@/lib/matching";
import { Card, SectionHeading, Badge, EmptyState, ItemStatusBadge, EvidenceBadge, DemoBadge, RealBadge } from "@/components/ui";
import { MarketplaceFilters } from "@/components/marketplace-filters";

export const metadata = { title: "Equipment marketplace" };

const CATEGORIES = ["monitor", "peripheral", "small_electronics", "networking", "furniture", "other"] as const;
const CONDITIONS = ["working_good", "working_marks", "working_defects", "untested", "parts_only"] as const;

type Search = {
  q?: string;
  category?: string;
  condition?: string;
  availability?: string;
  region?: string;
  origin?: string;
};

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const search: Search = {
    q: str(raw.q),
    category: str(raw.category),
    condition: str(raw.condition),
    availability: str(raw.availability) || "available",
    region: str(raw.region),
    origin: str(raw.origin) || "all",
  };

  const [user, { items, regions, total }] = await Promise.all([getSessionUser(), loadItems(search)]);

  return (
    <div className="space-y-6">
      <SectionHeading
        level={1}
        title="Equipment marketplace"
        description="Approved listings are public. Exact collection addresses and contact details are released to the reserved recipient only."
        actions={
          user ? (
            <Link href="/listings/new" className="no-underline hover:no-underline">
              <span className="inline-flex items-center gap-2 rounded-lg border border-forest-700 bg-forest-600 px-4 py-2 text-sm font-semibold text-white">
                List surplus equipment
              </span>
            </Link>
          ) : null
        }
      />

      <MarketplaceFilters
        categories={CATEGORIES.map((c) => ({ value: c, label: labelCategory(c) }))}
        conditions={CONDITIONS.map((c) => ({ value: c, label: labelCondition(c) }))}
        regions={regions}
        initial={search}
      />

      <p className="text-sm text-ink-muted" role="status">
        {items.length === total
          ? `Showing all ${total} listing${total === 1 ? "" : "s"} in the marketplace.`
          : `Showing ${items.length} of ${total} listing${total === 1 ? "" : "s"} in the marketplace.`}
      </p>

      {items.length === 0 ? (
        <EmptyState title="No listings match those filters">
          Try widening the condition floor or clearing the search text. Listings are only shown once their owner
          has published them.
        </EmptyState>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card as="li" key={item.id} className="flex flex-col overflow-hidden">
              <Link href={`/marketplace/${item.id}`} className="no-underline hover:no-underline">
                <img
                  src={item.photo ?? "/items/monitor-24.svg"}
                  alt={item.photoCaption ?? ""}
                  width={400}
                  height={300}
                  className="aspect-4/3 w-full border-b border-line bg-paper-sunken object-cover"
                />
              </Link>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <ItemStatusBadge status={item.status} />
                  {item.isDemo ? <DemoBadge /> : <RealBadge />}
                </div>
                <div>
                  <h2 className="text-base leading-snug">
                    <Link href={`/marketplace/${item.id}`} className="no-underline">
                      {item.title}
                    </Link>
                  </h2>
                  <p className="mt-0.5 lp-mono text-ink-muted">{item.id}</p>
                </div>
                <dl className="space-y-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-ink-muted">Condition</dt>
                    <dd className="font-medium">{labelCondition(item.conditionGrade)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-ink-muted">Quantity</dt>
                    <dd className="font-medium">{item.quantity}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-ink-muted">Area</dt>
                    <dd className="font-medium">{item.locationRegion || "not stated"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-ink-muted">Collection</dt>
                    <dd className="font-medium">
                      {item.collectionWindowStart
                        ? `from ${item.collectionWindowStart.slice(0, 10)}`
                        : "window not stated"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                  <span className="text-xs text-ink-muted">Condition evidence:</span>
                  {item.strongestEvidence ? (
                    <EvidenceBadge source={item.strongestEvidence} />
                  ) : (
                    <Badge tone="outline" glyph="–">
                      none recorded
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const CONDITION_RANK: Record<string, number> = {
  working_good: 5,
  working_marks: 4,
  working_defects: 3,
  untested: 2,
  parts_only: 1,
};

async function loadItems(search: Search) {
  const db = getDb();

  const statuses =
    search.availability === "all"
      ? (["available", "reserved", "transferred"] as const)
      : search.availability === "reserved"
        ? (["reserved"] as const)
        : search.availability === "transferred"
          ? (["transferred"] as const)
          : (["available"] as const);

  const clauses: SQL[] = [inArray(schema.items.status, [...statuses])];
  if (search.category && CATEGORIES.includes(search.category as (typeof CATEGORIES)[number])) {
    clauses.push(eq(schema.items.category, search.category as (typeof CATEGORIES)[number]));
  }
  if (search.region) clauses.push(eq(schema.items.locationRegion, search.region));
  if (search.origin === "demo") clauses.push(eq(schema.items.isDemo, true));
  if (search.origin === "real") clauses.push(eq(schema.items.isDemo, false));
  if (search.q) {
    const pattern = `%${search.q.toLowerCase()}%`;
    const text = or(
      like(schema.items.title, pattern),
      like(schema.items.description, pattern),
      like(schema.items.brand, pattern),
      like(schema.items.model, pattern),
      like(schema.items.id, `%${search.q.toUpperCase()}%`),
    );
    if (text) clauses.push(text);
  }

  const rows = await db
    .select()
    .from(schema.items)
    .where(and(...clauses));

  // Condition filter is a floor, applied here so the ordering of grades stays
  // in one place rather than being encoded in SQL.
  const floor = search.condition ? (CONDITION_RANK[search.condition] ?? 0) : 0;
  const filtered = rows.filter((r) => (CONDITION_RANK[r.conditionGrade] ?? 0) >= floor);

  const allRegions = [...new Set((await db.select({ r: schema.items.locationRegion }).from(schema.items)).map((x) => x.r))]
    .filter(Boolean)
    .sort();

  const ids = filtered.map((r) => r.id);
  const photos = ids.length
    ? await db.select().from(schema.itemPhotos).where(inArray(schema.itemPhotos.itemId, ids))
    : [];
  const evidence = ids.length
    ? await db.select().from(schema.conditionEvidence).where(inArray(schema.conditionEvidence.itemId, ids))
    : [];

  const items = filtered
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => {
      const photo = photos.filter((p) => p.itemId === item.id).sort((a, b) => a.sortOrder - b.sortOrder)[0];
      const sources = evidence.filter((e) => e.itemId === item.id).map((e) => e.source);
      const strongest = sources.includes("recipient_confirmed")
        ? "recipient_confirmed"
        : sources.includes("documented_test")
          ? "documented_test"
          : sources.includes("owner_reported")
            ? "owner_reported"
            : null;
      return {
        ...item,
        photo: photo ? photoUrl(photo.storedPath) : null,
        photoCaption: photo?.caption ?? null,
        strongestEvidence: strongest,
      };
    });

  // The denominator is every published listing, so the ratio means something
  // regardless of which filters are applied.
  const published = await db
    .select({ id: schema.items.id })
    .from(schema.items)
    .where(inArray(schema.items.status, ["available", "reserved", "transferred", "withdrawn"]));

  return { items, regions: allRegions, total: published.length };
}
