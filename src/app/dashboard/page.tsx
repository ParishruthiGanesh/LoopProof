import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSessionUser, canDonate, canReceive } from "@/lib/auth";
import { buildImpactReport } from "@/lib/impact";
import { labelCondition } from "@/lib/matching";
import { photoUrl } from "@/lib/uploads";
import {
  Card,
  SectionHeading,
  Badge,
  Stat,
  Callout,
  EmptyState,
  ItemStatusBadge,
  TransferStateBadge,
  DemoBadge,
  RealBadge,
} from "@/components/ui";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");

  const db = getDb();

  const [myItems, myTransfers, openRequests, matchRows, realImpact, demoImpact] = await Promise.all([
    db.select().from(schema.items).where(eq(schema.items.orgId, user.orgId)).orderBy(desc(schema.items.updatedAt)),
    db
      .select({ transfer: schema.transfers, itemTitle: schema.items.title })
      .from(schema.transfers)
      .innerJoin(schema.items, eq(schema.items.id, schema.transfers.itemId))
      .where(or(eq(schema.transfers.donorOrgId, user.orgId), eq(schema.transfers.recipientOrgId, user.orgId)))
      .orderBy(desc(schema.transfers.updatedAt)),
    db
      .select({ request: schema.requests, orgName: schema.organizations.name })
      .from(schema.requests)
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.requests.orgId))
      .where(eq(schema.requests.status, "open"))
      .orderBy(desc(schema.requests.createdAt)),
    db.select().from(schema.matchResults).where(eq(schema.matchResults.eligible, true)),
    buildImpactReport("real_only"),
    buildImpactReport("demo_only"),
  ]);

  const itemIds = myItems.map((i) => i.id);
  const photos = itemIds.length
    ? await db.select().from(schema.itemPhotos).where(inArray(schema.itemPhotos.itemId, itemIds))
    : [];

  const awaitingMe = myTransfers.filter((t) => {
    const role = t.transfer.donorOrgId === user.orgId ? "donor" : "recipient";
    if (t.transfer.state === "requested") return role === "donor";
    if (t.transfer.state === "reserved") return role === "donor";
    if (t.transfer.state === "released") return role === "recipient";
    return false;
  });
  const completed = myTransfers.filter((t) => t.transfer.state === "completed");
  const closedOther = myTransfers.filter((t) =>
    (["cancelled", "disputed", "declined"] as string[]).includes(t.transfer.state),
  );

  // Requests from other organizations that one of my available items could meet.
  const myAvailableIds = new Set(myItems.filter((i) => i.status === "available").map((i) => i.id));
  const suggestedForMe = openRequests
    .filter((r) => r.request.orgId !== user.orgId)
    .map((r) => ({
      ...r,
      myMatches: matchRows.filter((m) => m.requestId === r.request.id && myAvailableIds.has(m.itemId)),
    }))
    .filter((r) => r.myMatches.length > 0);

  const myOpenRequests = openRequests.filter((r) => r.request.orgId === user.orgId);

  return (
    <div className="space-y-8">
      <SectionHeading
        level={1}
        title={`Overview for ${user.orgName}`}
        description={
          <>
            Signed in as {user.name}.{" "}
            {canDonate(user) && canReceive(user)
              ? "This organization can both donate and receive."
              : canDonate(user)
                ? "This organization is registered as a donor."
                : "This organization is registered as a recipient."}
          </>
        }
        actions={
          <>
            {canDonate(user) ? (
              <Link href="/listings/new" className="no-underline hover:no-underline">
                <span className="inline-flex items-center rounded-lg border border-forest-700 bg-forest-600 px-4 py-2 text-sm font-semibold text-white">
                  List surplus equipment
                </span>
              </Link>
            ) : null}
            {canReceive(user) ? (
              <Link href="/requests" className="no-underline hover:no-underline">
                <span className="inline-flex items-center rounded-lg border border-line-strong bg-paper-raised px-4 py-2 text-sm font-semibold text-ink">
                  Post a request
                </span>
              </Link>
            ) : null}
          </>
        }
      />

      <Callout tone="neutral" title="Sample data and real records are kept apart">
        <p>
          Records shipped with this prototype carry a <DemoBadge /> label. Anything you create in this session
          carries <RealBadge />. The two are counted separately everywhere, including on the impact page.
        </p>
        <p className="mt-2">
          Real activity so far: <strong>{realImpact.confirmed.completedTransferCount}</strong> completed transfer
          {realImpact.confirmed.completedTransferCount === 1 ? "" : "s"}. Seeded examples:{" "}
          <strong>{demoImpact.confirmed.completedTransferCount}</strong>.
        </p>
      </Callout>

      {/* ---------------------------------------------------------- headline */}
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Your available equipment"
          value={myItems.filter((i) => i.status === "available").length}
          note="Published and open to requests."
        />
        <Stat
          label="Awaiting your action"
          value={awaitingMe.length}
          tone={awaitingMe.length > 0 ? "default" : "muted"}
          note="Transfers where the next step is yours."
        />
        <Stat
          label="Completed transfers"
          value={completed.length}
          note="Both acknowledgments recorded."
        />
        <Stat
          label="Closed without completing"
          value={closedOther.length}
          tone="muted"
          note="Declined, cancelled or disputed. Never counted as impact."
        />
      </dl>

      {/* -------------------------------------------------- awaiting action */}
      <section>
        <SectionHeading
          title="Transfers awaiting action"
          description="The next step on each of these is yours."
        />
        {awaitingMe.length === 0 ? (
          <EmptyState title="Nothing is waiting on you">
            When a recipient requests one of your items, or a donor releases an item to you, it appears here.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {awaitingMe.map(({ transfer, itemTitle }) => {
              const role = transfer.donorOrgId === user.orgId ? "donor" : "recipient";
              const next =
                transfer.state === "requested"
                  ? "Accept or decline this request"
                  : transfer.state === "reserved"
                    ? "Record release when the item is collected"
                    : "Record receipt, or report a problem";
              return (
                <Card as="li" key={transfer.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TransferStateBadge state={transfer.state} />
                      <Badge tone="outline" glyph={role === "donor" ? "↑" : "↓"}>
                        You are the {role}
                      </Badge>
                      {transfer.requiresReacknowledgement ? (
                        <Badge tone="amber" glyph="!">
                          Evidence changed
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1.5 font-semibold">{itemTitle}</p>
                    <p className="text-sm text-ink-soft">{next}</p>
                  </div>
                  <Link href={`/transfers/${transfer.id}`} className="no-underline hover:no-underline">
                    <span className="inline-flex items-center rounded-lg border border-forest-700 bg-forest-600 px-3.5 py-1.5 text-sm font-semibold text-white">
                      Open workspace
                    </span>
                  </Link>
                </Card>
              );
            })}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------- requests + matches */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeading
            title="Open requests you could meet"
            description="Requests from other organizations that one of your available listings satisfies on the hard rules."
          />
          {suggestedForMe.length === 0 ? (
            <EmptyState title="No suggested matches right now">
              {canDonate(user)
                ? "When a recipient posts a request that one of your available listings meets, it appears here with the reasons."
                : "This organization has no listings to match against requests."}
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {suggestedForMe.map(({ request, orgName, myMatches }) => (
                <Card as="li" key={request.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="lime" glyph="●">
                      {myMatches.length} of your item{myMatches.length === 1 ? "" : "s"} eligible
                    </Badge>
                    {request.isDemo ? <DemoBadge /> : <RealBadge />}
                  </div>
                  <h3 className="mt-1.5 text-base">
                    <Link href={`/requests/${request.id}`} className="no-underline">
                      {request.title}
                    </Link>
                  </h3>
                  <p className="text-xs text-ink-muted">
                    {orgName} · needs {request.quantity} · {labelCondition(request.minConditionGrade)} or better
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                    {myMatches.slice(0, 2).map((match) => {
                      const reasons = JSON.parse(match.reasons) as string[];
                      return (
                        <li key={match.id}>
                          <Link href={`/marketplace/${match.itemId}`} className="lp-mono">
                            {match.itemId}
                          </Link>{" "}
                          — meets {match.constraintsMet} of {match.constraintsChecked} checks.{" "}
                          {reasons[0] ?? ""}
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionHeading
            title="Your open requests"
            description="What your organization has asked for."
          />
          {myOpenRequests.length === 0 ? (
            <EmptyState
              title="No open requests"
              action={
                canReceive(user) ? (
                  <Link href="/requests">Post a request</Link>
                ) : undefined
              }
            >
              {canReceive(user)
                ? "Describe what you need in plain language and LoopProof will rank the listings that could satisfy it."
                : "This organization is registered as a donor, so it does not post requests."}
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {myOpenRequests.map(({ request }) => {
                const eligible = matchRows.filter((m) => m.requestId === request.id).length;
                return (
                  <Card as="li" key={request.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="lime" glyph="●">
                        Open
                      </Badge>
                      {request.isDemo ? <DemoBadge /> : <RealBadge />}
                    </div>
                    <h3 className="mt-1.5 text-base">
                      <Link href={`/requests/${request.id}`} className="no-underline">
                        {request.title}
                      </Link>
                    </h3>
                    <p className="text-xs text-ink-muted">
                      <span className="lp-mono">{request.id}</span> · needs {request.quantity}
                    </p>
                    <p className="mt-1.5 text-sm text-ink-soft">
                      {eligible > 0
                        ? `${eligible} eligible match${eligible === 1 ? "" : "es"} found.`
                        : "No eligible matches yet."}
                    </p>
                  </Card>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------- my listings */}
      <section>
        <SectionHeading
          title="Your equipment"
          description="Everything your organization has listed, including drafts and transferred items."
        />
        {myItems.length === 0 ? (
          <EmptyState
            title="No listings yet"
            action={canDonate(user) ? <Link href="/listings/new">Create your first listing</Link> : undefined}
          >
            {canDonate(user)
              ? "Photograph a surplus item and LoopProof will help you turn it into a listing."
              : "This organization is registered as a recipient, so it does not create listings."}
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myItems.map((item) => {
              const photo = photos
                .filter((p) => p.itemId === item.id)
                .sort((a, b) => a.sortOrder - b.sortOrder)[0];
              return (
                <Card as="li" key={item.id} className="flex gap-3 p-4">
                  <img
                    src={photo ? photoUrl(photo.storedPath) : "/items/monitor-24.svg"}
                    alt=""
                    width={72}
                    height={54}
                    className="h-14 w-18 shrink-0 rounded-lg border border-line bg-paper-sunken object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ItemStatusBadge status={item.status} />
                      {item.isDemo ? <DemoBadge /> : <RealBadge />}
                    </div>
                    <h3 className="mt-1.5 truncate text-sm font-semibold">
                      <Link href={`/marketplace/${item.id}`} className="no-underline">
                        {item.title}
                      </Link>
                    </h3>
                    <p className="truncate text-xs text-ink-muted">
                      <span className="lp-mono">{item.id}</span> · {item.quantity} available
                    </p>
                    <p className="mt-1 text-xs">
                      <Link href={`/passport/${item.id}`}>Passport</Link>
                    </p>
                  </div>
                </Card>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------------------------------------------------- how it works */}
      <section>
        <SectionHeading title="How LoopProof works" />
        <Card className="p-5">
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Photograph it", "Upload up to three photographs. A draft listing comes back with questions only you can answer."],
              ["Confirm the draft", "Tick off each suggested specification. Unconfirmed values never reach the public record."],
              ["Find a recipient", "Hard rules decide eligibility; plain-language interpretation only reorders what already qualifies."],
              ["Complete the handoff", "One request is accepted and the item reserved. Donor records release, recipient records receipt."],
              ["Inspect the evidence", "The passport shows the timeline, both acknowledgments, and whether the evidence still matches its anchor."],
            ].map(([title, body], index) => (
              <li key={title}>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-forest-600 text-xs font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-2 text-sm">{title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{body}</p>
              </li>
            ))}
          </ol>
        </Card>
      </section>
    </div>
  );
}
