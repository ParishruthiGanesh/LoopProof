import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { STATE_LABELS, type TransferState } from "@/lib/transfer-state";
import { Card, SectionHeading, Badge, EmptyState, TransferStateBadge, DemoBadge, RealBadge } from "@/components/ui";

export const metadata = { title: "Transfers" };

const GROUPS: Array<{ title: string; description: string; states: TransferState[] }> = [
  {
    title: "Awaiting your action",
    description: "Something is waiting on your organization.",
    states: ["requested", "reserved", "released"],
  },
  { title: "Completed", description: "Both acknowledgments recorded.", states: ["completed"] },
  {
    title: "Closed without completing",
    description: "Declined, cancelled or disputed. These are excluded from confirmed impact totals.",
    states: ["declined", "cancelled", "disputed"],
  },
];

export default async function TransfersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");

  const db = getDb();
  const rows = await db
    .select({ transfer: schema.transfers, itemTitle: schema.items.title })
    .from(schema.transfers)
    .innerJoin(schema.items, eq(schema.items.id, schema.transfers.itemId))
    .where(
      or(
        eq(schema.transfers.donorOrgId, user.orgId),
        eq(schema.transfers.recipientOrgId, user.orgId),
      ),
    )
    .orderBy(desc(schema.transfers.updatedAt));

  const orgs = await db.select().from(schema.organizations);
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? "Unknown";

  return (
    <div className="space-y-7">
      <SectionHeading
        level={1}
        title="Transfers"
        description="Every transfer your organization is party to, as donor or as recipient. Both parties see the same timeline."
      />

      {rows.length === 0 ? (
        <EmptyState title="No transfers yet" action={<Link href="/marketplace">Browse equipment</Link>}>
          A transfer starts when a recipient submits a request against a listing.
        </EmptyState>
      ) : (
        GROUPS.map((group) => {
          const items = rows.filter((r) => group.states.includes(r.transfer.state));
          if (items.length === 0) return null;
          return (
            <section key={group.title}>
              <h2 className="text-lg">{group.title}</h2>
              <p className="mt-0.5 text-sm text-ink-muted">{group.description}</p>
              <ul className="mt-3 space-y-3">
                {items.map(({ transfer, itemTitle }) => {
                  const role = transfer.donorOrgId === user.orgId ? "donor" : "recipient";
                  const other =
                    role === "donor" ? orgName(transfer.recipientOrgId) : orgName(transfer.donorOrgId);
                  return (
                    <Card as="li" key={transfer.id} className="p-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <TransferStateBadge state={transfer.state} />
                        <Badge tone="outline" glyph={role === "donor" ? "↑" : "↓"}>
                          You are the {role}
                        </Badge>
                        {transfer.requiresReacknowledgement ? (
                          <Badge tone="amber" glyph="!">
                            Evidence changed — re-acknowledgment needed
                          </Badge>
                        ) : null}
                        {transfer.isDemo ? <DemoBadge /> : <RealBadge />}
                      </div>
                      <h3 className="mt-2 text-base">
                        <Link href={`/transfers/${transfer.id}`} className="no-underline">
                          {itemTitle}
                        </Link>
                      </h3>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        <span className="lp-mono">{transfer.id}</span> · item{" "}
                        <span className="lp-mono">{transfer.itemId}</span> · with {other} · updated{" "}
                        {transfer.updatedAt.slice(0, 10)}
                      </p>
                      <p className="mt-2 text-sm text-ink-soft">
                        {STATE_LABELS[transfer.state]}
                        {transfer.state === "disputed" && transfer.disputeReason
                          ? `: ${transfer.disputeReason}`
                          : ""}
                        {transfer.state === "cancelled" && transfer.cancelReason
                          ? `: ${transfer.cancelReason}`
                          : ""}
                      </p>
                    </Card>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
