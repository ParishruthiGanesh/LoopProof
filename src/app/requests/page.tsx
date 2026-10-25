import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSessionUser, canReceive } from "@/lib/auth";
import { labelCategory, labelCondition, parseRequiredSpecs } from "@/lib/matching";
import { Card, SectionHeading, Badge, EmptyState, DemoBadge, RealBadge, Callout } from "@/components/ui";
import { NewRequestForm } from "@/components/new-request-form";

export const metadata = { title: "Requests and matching" };

export default async function RequestsPage() {
  const user = await getSessionUser();
  const db = getDb();

  const rows = await db
    .select({ request: schema.requests, orgName: schema.organizations.name })
    .from(schema.requests)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.requests.orgId))
    .orderBy(desc(schema.requests.createdAt));

  const matchCounts = await db
    .select({ requestId: schema.matchResults.requestId, eligible: schema.matchResults.eligible })
    .from(schema.matchResults);

  const countFor = (requestId: string) => {
    const rowsFor = matchCounts.filter((m) => m.requestId === requestId);
    return { eligible: rowsFor.filter((m) => m.eligible).length, total: rowsFor.length };
  };

  return (
    <div className="space-y-7">
      <SectionHeading
        level={1}
        title="Requests and matching"
        description="Recipients describe what they need in plain language and in structured requirements. Matching checks the structured constraints first, and explains every candidate."
      />

      <div className="grid gap-7 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <h2 className="text-lg">Open requests</h2>
          {rows.length === 0 ? (
            <EmptyState title="No requests posted yet">
              A receiving organization can post what it needs, and LoopProof will rank the listings that could
              satisfy it.
            </EmptyState>
          ) : (
            <ul className="space-y-4">
              {rows.map(({ request, orgName }) => {
                const counts = countFor(request.id);
                const specs = parseRequiredSpecs(request.requiredSpecs);
                return (
                  <Card as="li" key={request.id} className="p-5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={request.status === "open" ? "lime" : "neutral"} glyph={request.status === "open" ? "●" : "–"}>
                        {request.status === "open" ? "Open" : request.status === "fulfilled" ? "Fulfilled" : "Closed"}
                      </Badge>
                      <Badge tone="outline">{labelCategory(request.category)}</Badge>
                      {request.isDemo ? <DemoBadge /> : <RealBadge />}
                    </div>
                    <h3 className="mt-2 text-base">
                      <Link href={`/requests/${request.id}`} className="no-underline">
                        {request.title}
                      </Link>
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      <span className="lp-mono">{request.id}</span> · {orgName} · {request.locationRegion}
                    </p>
                    <p className="mt-2 line-clamp-3 text-sm text-ink-soft">{request.freeText}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-xs text-ink-muted">Quantity</dt>
                        <dd className="font-medium">{request.quantity}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-muted">Condition floor</dt>
                        <dd className="font-medium">{labelCondition(request.minConditionGrade)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-muted">Deadline</dt>
                        <dd className="font-medium">
                          {request.collectionDeadline ? request.collectionDeadline.slice(0, 10) : "none"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-muted">Within</dt>
                        <dd className="font-medium">
                          {request.maxDistanceKm != null ? `${request.maxDistanceKm} km` : "no limit"}
                        </dd>
                      </div>
                    </dl>
                    {specs.length > 0 ? (
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {specs.map((spec) => (
                          <li key={spec.label}>
                            <Badge tone={spec.required ? "forest" : "outline"} glyph={spec.required ? "!" : "·"}>
                              {spec.label}: {spec.value}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
                      <Link href={`/requests/${request.id}`}>
                        {counts.total > 0
                          ? `View ${counts.eligible} eligible match${counts.eligible === 1 ? "" : "es"} of ${counts.total} candidates`
                          : "Run matching"}
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-lg">Post a request</h2>
          {!user ? (
            <Card className="p-5">
              <p className="text-sm text-ink-soft">
                <Link href="/signin">Sign in</Link> as a receiving organization to post what you need.
              </p>
            </Card>
          ) : !canReceive(user) ? (
            <Callout tone="warn" title="This organization cannot post requests">
              {user.orgName} is registered as a donating organization. The server rejects request creation from
              this account.
            </Callout>
          ) : (
            <Card className="p-5">
              <NewRequestForm orgRegion={user.orgLocationRegion} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
