import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { runMatching, labelCategory, labelCondition, parseRequiredSpecs, type MatchCandidate } from "@/lib/matching";
import { photoUrl } from "@/lib/uploads";
import {
  Card,
  SectionHeading,
  Badge,
  Callout,
  EmptyState,
  DemoBadge,
  RealBadge,
  ItemStatusBadge,
} from "@/components/ui";
import { RematchButton } from "@/components/rematch-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const rows = await db.select({ t: schema.requests.title }).from(schema.requests).where(eq(schema.requests.id, id));
  return { title: rows[0]?.t ?? "Request not found" };
}

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const rows = await db
    .select({ request: schema.requests, orgName: schema.organizations.name })
    .from(schema.requests)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.requests.orgId))
    .where(eq(schema.requests.id, id))
    .limit(1);
  if (!rows[0]) notFound();

  const { request, orgName } = rows[0];
  const [user, result] = await Promise.all([getSessionUser(), runMatching(id)]);
  const specs = parseRequiredSpecs(request.requiredSpecs);

  return (
    <div className="space-y-7">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <Link href="/requests">Requests</Link> <span aria-hidden="true">/</span>{" "}
        <span className="lp-mono">{request.id}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={request.status === "open" ? "lime" : "neutral"} glyph={request.status === "open" ? "●" : "–"}>
          {request.status}
        </Badge>
        <Badge tone="outline">{labelCategory(request.category)}</Badge>
        {request.isDemo ? <DemoBadge /> : <RealBadge />}
      </div>

      <SectionHeading
        level={1}
        title={request.title}
        description={
          <>
            Posted by <strong>{orgName}</strong> · {request.locationRegion}
          </>
        }
        actions={<RematchButton requestId={request.id} />}
      />

      <div className="grid gap-7 lg:grid-cols-[1fr_1.5fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-base">In the recipient&rsquo;s own words</h2>
            <p className="mt-2 whitespace-pre-line text-ink-soft">{request.freeText}</p>
          </Card>

          <Card className="p-5">
            <h2 className="text-base">Structured requirements</h2>
            <p className="mt-1 text-sm text-ink-muted">
              These are checked as hard rules. A listing that fails one is listed as incompatible, with the reason.
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Category">{labelCategory(request.category)}</Row>
              <Row label="Quantity">{request.quantity}</Row>
              <Row label="Lowest acceptable condition">{labelCondition(request.minConditionGrade)}</Row>
              <Row label="Collection deadline">
                {request.collectionDeadline ? request.collectionDeadline.slice(0, 10) : "none stated"}
              </Row>
              <Row label="Maximum distance">
                {request.maxDistanceKm != null ? `${request.maxDistanceKm} km` : "no limit"}
              </Row>
              <Row label="Cables required">{request.needsCablesIncluded ? "yes" : "not required"}</Row>
            </dl>
            {specs.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {specs.map((spec) => (
                  <li key={spec.label} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={spec.required ? "forest" : "outline"} glyph={spec.required ? "!" : "·"}>
                      {spec.required ? "Required" : "Preferred"}
                    </Badge>
                    <span>
                      {spec.label}: <strong>{spec.value}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card className="p-5">
            <h2 className="text-base">How this ranking was produced</h2>
            <p className="mt-2 text-sm text-ink-soft">
              {result.method === "rules_and_semantic"
                ? "Hard eligibility rules were applied first. The eligible candidates were then reordered by interpreting the recipient's plain-language description."
                : "Hard eligibility rules were applied, then eligible candidates were ordered by how many of the stated requirements they demonstrably meet, and by distance where coordinates exist."}
            </p>
            {result.semanticNote ? (
              <Callout tone="info" title="How the request was interpreted">
                {result.semanticNote}
              </Callout>
            ) : null}
            {result.semanticUnavailableReason ? (
              <Callout tone="warn" title="Semantic matching was not used">
                {result.semanticUnavailableReason}
              </Callout>
            ) : null}
            <Callout tone="neutral">
              No probability or confidence percentage is shown, because LoopProof has no justified method for
              producing one. Ranking is ordering plus stated reasons.
            </Callout>
          </Card>
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="text-lg">
              Suggested matches{" "}
              <span className="text-base font-normal text-ink-muted">({result.eligible.length} eligible)</span>
            </h2>
            {result.eligible.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="Nothing currently meets these requirements">
                  Every candidate failed at least one hard rule. The incompatible candidates below name which one.
                  LoopProof does not promote a near-miss into a match.
                </EmptyState>
              </div>
            ) : (
              <ol className="mt-3 space-y-4">
                {result.eligible.map((candidate, index) => (
                  <CandidateCard
                    key={candidate.itemId}
                    candidate={candidate}
                    rank={index + 1}
                    canRequest={Boolean(user && user.orgId === request.orgId)}
                    requestId={request.id}
                  />
                ))}
              </ol>
            )}
          </section>

          {result.ineligible.length > 0 ? (
            <section>
              <h2 className="text-lg">
                Incompatible candidates{" "}
                <span className="text-base font-normal text-ink-muted">({result.ineligible.length})</span>
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Rejected rather than ranked low, with the blocking reason named.
              </p>
              <ul className="mt-3 space-y-3">
                {result.ineligible.map((candidate) => (
                  <Card as="li" key={candidate.itemId} className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/marketplace/${candidate.itemId}`} className="font-semibold no-underline">
                        {candidate.title}
                      </Link>
                      <span className="lp-mono text-ink-muted">{candidate.itemId}</span>
                      <Badge tone="clay" glyph="✕">
                        Not eligible
                      </Badge>
                    </div>
                    <ul className="mt-2 space-y-1 text-sm text-clay">
                      {candidate.blockers.map((blocker) => (
                        <li key={blocker} className="flex gap-2">
                          <span aria-hidden="true">✕</span>
                          <span>{blocker}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/60 pb-1.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

async function CandidateCard({
  candidate,
  rank,
  canRequest,
  requestId,
}: {
  candidate: MatchCandidate;
  rank: number;
  canRequest: boolean;
  requestId: string;
}) {
  return (
    <Card as="li" className="overflow-hidden">
      <div className="flex gap-4 p-4">
        <div className="shrink-0 space-y-2 text-center">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-forest-600 text-sm font-bold text-white">
            {rank}
          </span>
          <img
            src={candidate.photoPath ? photoUrl(candidate.photoPath) : "/items/monitor-24.svg"}
            alt=""
            width={96}
            height={72}
            className="h-16 w-24 rounded-lg border border-line bg-paper-sunken object-cover"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <ItemStatusBadge status={candidate.status} />
              {candidate.isDemo ? <DemoBadge /> : <RealBadge />}
            </div>
            <h3 className="mt-1.5 text-base">
              <Link href={`/marketplace/${candidate.itemId}`} className="no-underline">
                {candidate.title}
              </Link>
            </h3>
            <p className="text-xs text-ink-muted">
              <span className="lp-mono">{candidate.itemId}</span> · {candidate.orgName} ·{" "}
              {labelCondition(candidate.conditionGrade)}
            </p>
          </div>

          <p className="text-sm">
            <span className="font-semibold">
              Meets {candidate.constraintsMet} of {candidate.constraintsChecked} checked requirements.
            </span>{" "}
            <span className="text-ink-muted">
              {candidate.distanceBasis === "region_centroid" && candidate.distanceKm != null
                ? `About ${candidate.distanceKm} km away, measured between region centroids.`
                : "Distance unknown: coordinates are not recorded for both sides."}
            </span>
          </p>

          {candidate.semanticReason ? (
            <div className="rounded-lg border border-forest-200 bg-mint-soft px-3 py-2 text-sm text-forest-700">
              <p className="text-xs font-semibold uppercase tracking-wide">Interpreted from the request</p>
              <p className="mt-0.5">{candidate.semanticReason}</p>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Why it matches</p>
            <ul className="mt-1 space-y-0.5 text-sm text-ink-soft">
              {candidate.reasons.map((reason) => (
                <li key={reason} className="flex gap-2">
                  <span aria-hidden="true" className="text-forest-500">
                    ✓
                  </span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          {candidate.missingInfo.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-ink">
                Limitations and missing information
              </p>
              <ul className="mt-1 space-y-0.5 text-sm text-amber-ink">
                {candidate.missingInfo.map((info) => (
                  <li key={info} className="flex gap-2">
                    <span aria-hidden="true">?</span>
                    <span>{info}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {canRequest ? (
            <Link
              href={`/marketplace/${candidate.itemId}?request=${requestId}`}
              className="inline-block text-sm font-semibold"
            >
              Request this item &rarr;
            </Link>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
