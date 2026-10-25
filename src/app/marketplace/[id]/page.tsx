import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSessionUser, canReceive } from "@/lib/auth";
import { loadItemView } from "@/lib/items";
import { labelCategory, labelCondition, labelSource } from "@/lib/matching";
import {
  Card,
  SectionHeading,
  Badge,
  Callout,
  KeyValue,
  EvidenceBadge,
  ItemStatusBadge,
  DemoBadge,
  RealBadge,
  ChainStatusBadge,
  Disclosure,
} from "@/components/ui";
import { RequestItemForm } from "@/components/request-item-form";
import { ChecklistTable } from "@/components/checklist-table";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadItemView(id);
  return { title: view ? view.item.title : "Listing not found" };
}

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [view, user] = await Promise.all([loadItemView(id), getSessionUser()]);
  if (!view) notFound();

  const { item } = view;
  const isOwner = user?.orgId === item.orgId;
  const db = getDb();

  const openRequests =
    user && canReceive(user)
      ? await db
          .select()
          .from(schema.requests)
          .where(and(eq(schema.requests.orgId, user.orgId), eq(schema.requests.status, "open")))
      : [];

  const myTransfers = user
    ? await db
        .select()
        .from(schema.transfers)
        .where(and(eq(schema.transfers.itemId, id), eq(schema.transfers.recipientOrgId, user.orgId)))
    : [];
  const myOpenTransfer = myTransfers.find((t) =>
    (["requested", "reserved", "released"] as string[]).includes(t.state),
  );

  const incomingRequests = isOwner
    ? await db
        .select()
        .from(schema.transfers)
        .where(and(eq(schema.transfers.itemId, id), inArray(schema.transfers.state, ["requested"])))
    : [];

  const activeReservation = (
    await db
      .select()
      .from(schema.transfers)
      .where(and(eq(schema.transfers.itemId, id), inArray(schema.transfers.state, ["reserved", "released"])))
      .limit(1)
  )[0];

  const confirmedSpecs = view.specs.filter((s) => s.confirmedByOwner);
  const unconfirmedSpecs = view.specs.filter((s) => !s.confirmedByOwner);

  return (
    <div className="space-y-7">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <Link href="/marketplace">Equipment</Link> <span aria-hidden="true">/</span>{" "}
        <span className="lp-mono">{item.id}</span>
      </nav>

      <div className="grid gap-7 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <ItemStatusBadge status={item.status} />
              {item.isDemo ? <DemoBadge /> : <RealBadge />}
              <Badge tone="outline">{labelCategory(item.category)}</Badge>
            </div>
            <SectionHeading
              level={1}
              title={item.title}
              description={
                <>
                  Offered by <strong>{view.orgName}</strong> · {item.locationRegion || "area not stated"}
                </>
              }
            />
          </div>

          {view.photos.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {view.photos.map((photo) => (
                <li key={photo.id}>
                  <figure className="space-y-1.5">
                    <img
                      src={photo.url}
                      alt={photo.caption}
                      width={320}
                      height={240}
                      className="aspect-4/3 w-full rounded-card border border-line bg-paper-sunken object-cover"
                    />
                    <figcaption className="text-xs text-ink-muted">{photo.caption}</figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          ) : null}

          <Card className="p-5">
            <h2 className="text-base">Description</h2>
            <p className="mt-2 whitespace-pre-line text-ink-soft">{item.description}</p>
          </Card>

          <Card className="p-5">
            <h2 className="text-base">Specifications</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Each value is labelled with its basis. Only confirmed values are covered by the anchored evidence
              digest.
            </p>
            {confirmedSpecs.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">No confirmed specifications recorded.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Confirmed specifications and their evidence basis</caption>
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        Specification
                      </th>
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        Value
                      </th>
                      <th scope="col" className="py-2 font-semibold">
                        Basis
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmedSpecs.map((spec) => (
                      <tr key={spec.id} className="border-b border-line/60 align-top">
                        <th scope="row" className="py-2.5 pr-4 text-left font-medium">
                          {spec.label}
                        </th>
                        <td className="py-2.5 pr-4">{spec.value}</td>
                        <td className="py-2.5">
                          <EvidenceBadge source={spec.source} />
                          {spec.basis ? <p className="mt-1 text-xs text-ink-muted">{spec.basis}</p> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {unconfirmedSpecs.length > 0 ? (
              <Callout tone="warn" title="Suggestions the owner has not confirmed">
                <ul className="mt-1 space-y-1">
                  {unconfirmedSpecs.map((spec) => (
                    <li key={spec.id}>
                      {spec.label}: {spec.value} — <EvidenceBadge source={spec.source} />
                    </li>
                  ))}
                </ul>
                <p className="mt-2">
                  These are excluded from the public evidence manifest and from the anchored digest.
                </p>
              </Callout>
            ) : null}
          </Card>

          <Card className="p-5">
            <h2 className="text-base">Testing checklist</h2>
            {view.checklist ? (
              <ChecklistTable checklist={view.checklist} />
            ) : (
              <p className="mt-2 text-sm text-ink-muted">No testing checklist was recorded for this item.</p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-base">Condition evidence</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Statements recorded against this item, newest last, each with the organization that recorded it.
            </p>
            <ol className="mt-3 space-y-3">
              {view.evidence.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-line bg-paper-sunken/40 p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <EvidenceBadge source={entry.source} />
                    <span className="text-xs text-ink-muted">
                      {entry.recordedByOrgName ?? "unattributed"} · {entry.recordedAt.slice(0, 10)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-ink-soft">{entry.statement}</p>
                </li>
              ))}
              {view.evidence.length === 0 ? (
                <li className="text-sm text-ink-muted">No condition evidence recorded.</li>
              ) : null}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-base">At a glance</h2>
            <dl className="mt-2 divide-y divide-line">
              <KeyValue label="Item ID">
                <span className="lp-mono">{item.id}</span>
              </KeyValue>
              <KeyValue label="Confirmed condition">{labelCondition(item.conditionGrade)}</KeyValue>
              <KeyValue label="Quantity offered">{item.quantity}</KeyValue>
              <KeyValue label="Brand / model">
                {item.brand === "unknown" && item.model === "unknown"
                  ? "unknown"
                  : `${item.brand} ${item.model}`.trim()}
              </KeyValue>
              <KeyValue label="Weight">
                {item.massKg != null ? (
                  <>
                    {item.massKg} kg{" "}
                    <Badge tone={item.massBasis === "measured" ? "mint" : "amber"} glyph={item.massBasis === "measured" ? "✓" : "≈"}>
                      {item.massBasis === "measured" ? "measured" : "estimated"}
                    </Badge>
                  </>
                ) : (
                  <Badge tone="outline" glyph="–">
                    not recorded
                  </Badge>
                )}
              </KeyValue>
              <KeyValue label="Replacement value">
                {item.replacementValue != null ? (
                  <>
                    {item.replacementValue.toLocaleString()}{" "}
                    <Badge tone={item.replacementValueBasis === "quoted_evidence" ? "mint" : "amber"} glyph="≈">
                      {item.replacementValueBasis === "quoted_evidence" ? "quoted evidence" : "owner estimate"}
                    </Badge>
                  </>
                ) : (
                  <Badge tone="outline" glyph="–">
                    not stated
                  </Badge>
                )}
              </KeyValue>
              <KeyValue label="General location">{item.locationRegion || "not stated"}</KeyValue>
              <KeyValue label="Collection window">
                {item.collectionWindowStart || item.collectionWindowEnd
                  ? `${item.collectionWindowStart?.slice(0, 10) ?? "any"} to ${item.collectionWindowEnd?.slice(0, 10) ?? "open"}`
                  : "not stated"}
              </KeyValue>
              <KeyValue label="Known defects">{item.knownDefects || "none reported"}</KeyValue>
            </dl>

            {isOwner ? (
              <Callout tone="info" title="Private details, visible to you as the owner">
                <p className="lp-mono">{item.collectionAddress || "no collection address recorded"}</p>
                {item.privateNotes ? <p className="mt-1.5">{item.privateNotes}</p> : null}
              </Callout>
            ) : activeReservation && user?.orgId === activeReservation.recipientOrgId ? (
              <Callout tone="info" title="Collection address, released to you as the reserved recipient">
                <p className="lp-mono">{item.collectionAddress || "no collection address recorded"}</p>
              </Callout>
            ) : (
              <p className="mt-4 text-xs text-ink-muted">
                The exact collection address and the donor&rsquo;s contact details are released to the reserved
                recipient only.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-base">Evidence record</h2>
            <dl className="mt-2 divide-y divide-line">
              <KeyValue label="Public manifest version">
                {view.manifest ? `v${view.manifest.versionNumber} (${view.manifest.manifestVersion})` : "not snapshotted"}
              </KeyValue>
              <KeyValue label="Anchor status">
                <ChainStatusBadge status={view.anchor?.status ?? "not_anchored"} />
              </KeyValue>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/passport/${item.id}`} className="no-underline hover:no-underline">
                <span className="inline-flex items-center gap-2 rounded-lg border border-forest-700 bg-forest-600 px-3.5 py-1.5 text-sm font-semibold text-white">
                  Open public passport
                </span>
              </Link>
            </div>
            {view.anchor?.error ? (
              <Callout tone="warn" title="Anchoring note">
                {view.anchor.error}
              </Callout>
            ) : null}
            <Disclosure summary="Technical anchor detail">
              <dl className="divide-y divide-line">
                <KeyValue label="Item key (bytes32)">
                  <span className="lp-mono">{view.anchor?.itemKey}</span>
                </KeyValue>
                <KeyValue label="Manifest SHA-256">
                  <span className="lp-mono">{view.manifest?.sha256 ?? "not snapshotted"}</span>
                </KeyValue>
                <KeyValue label="Contract">
                  <span className="lp-mono">{view.anchor?.contractAddress ?? "not configured"}</span>
                </KeyValue>
                <KeyValue label="Transaction">
                  <span className="lp-mono">{view.anchor?.txHash ?? "none"}</span>
                </KeyValue>
              </dl>
            </Disclosure>
          </Card>

          {isOwner ? (
            <Card className="p-5">
              <h2 className="text-base">Requests for this item</h2>
              {incomingRequests.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">No open requests yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {incomingRequests.map((transfer) => (
                    <li key={transfer.id} className="rounded-lg border border-line bg-paper-sunken/40 p-3">
                      <Link href={`/transfers/${transfer.id}`} className="font-semibold no-underline">
                        {transfer.id}
                      </Link>
                      <p className="mt-1 text-sm text-ink-soft">{transfer.requestMessage}</p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-sm text-ink-muted">
                Accepting one request reserves the item and declines the others.
              </p>
            </Card>
          ) : (
            <Card className="p-5">
              <h2 className="text-base">Request this item</h2>
              {!user ? (
                <p className="mt-2 text-sm text-ink-soft">
                  <Link href="/signin">Sign in</Link> as a receiving organization to submit a request.
                </p>
              ) : !canReceive(user) ? (
                <Callout tone="warn">
                  {user.orgName} is registered as a donating organization, so it cannot request items. This is
                  enforced on the server, not just hidden in the interface.
                </Callout>
              ) : myOpenTransfer ? (
                <Callout tone="info" title="You already have an open request">
                  <Link href={`/transfers/${myOpenTransfer.id}`}>Open transfer {myOpenTransfer.id}</Link> — current
                  state: {myOpenTransfer.state}.
                </Callout>
              ) : item.status !== "available" ? (
                <Callout tone="warn" title={`This item is ${item.status}`}>
                  {item.status === "reserved"
                    ? "Another organization holds the reservation. Only one reservation can exist at a time, so no further requests can be accepted until it is cancelled."
                    : "It is no longer open to requests."}
                </Callout>
              ) : (
                <RequestItemForm
                  itemId={item.id}
                  maxQuantity={item.quantity}
                  requests={openRequests.map((r) => ({ id: r.id, title: r.title }))}
                />
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
