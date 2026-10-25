import Link from "next/link";
import { buildImpactReport, loadAssumptions, type ImpactScope } from "@/lib/impact";
import { Card, SectionHeading, Badge, Stat, Callout, KeyValue, Disclosure } from "@/components/ui";
import { ImpactScopeTabs } from "@/components/impact-scope-tabs";

export const metadata = { title: "Impact and evidence" };

const SCOPES: Record<string, ImpactScope> = {
  all: "all",
  real: "real_only",
  demo: "demo_only",
};

export default async function ImpactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const key = (Array.isArray(raw.scope) ? raw.scope[0] : raw.scope) ?? "all";
  const scope = SCOPES[key] ?? "all";

  const [report, assumptions] = await Promise.all([buildImpactReport(scope), loadAssumptions()]);
  const { confirmed, notCounted, emissions, dataQuality } = report;

  return (
    <div className="space-y-8">
      <SectionHeading
        level={1}
        title="Impact and evidence"
        description="Only confirmed completed transfers count. Everything else is reported separately, and nothing is estimated from a factor LoopProof cannot cite."
      />

      <ImpactScopeTabs active={key} />

      <Callout tone="info" title="What counts, and what does not">
        <p>
          A transfer counts here only when it reached state <strong>completed</strong>, which requires the
          donor&rsquo;s release acknowledgment <em>and</em> the recipient&rsquo;s receipt acknowledgment.
          Publishing a listing earns nothing. Reservations, cancellations and disputes earn nothing.
        </p>
      </Callout>

      {/* ----------------------------------------------------- confirmed */}
      <section>
        <SectionHeading title="Confirmed completed reuse" />
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Completed transfers"
            value={confirmed.completedTransferCount}
            note="Both acknowledgments recorded, not later disputed."
          />
          <Stat
            label="Distinct items transferred"
            value={confirmed.itemCount}
            note="Listings that completed at least one transfer."
          />
          <Stat
            label="Units transferred"
            value={confirmed.unitCount}
            note="Sum of the quantity on each completed transfer."
          />
          <Stat
            label="Items with a recorded mass"
            value={`${dataQuality.completedItemsWithMeasuredMass + dataQuality.completedItemsWithEstimatedMass}`}
            unit={`of ${confirmed.itemCount}`}
            tone="muted"
            note={`${dataQuality.completedItemsWithNoMass} completed item(s) have no mass recorded and contribute nothing.`}
          />
        </dl>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <h3 className="text-base">Recorded mass of transferred items</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Measured and estimated masses are reported separately and never added into one headline number.
            </p>
            <dl className="mt-3 divide-y divide-line">
              <KeyValue label="Measured">
                <span className="text-lg font-semibold tabular-nums text-forest-600">
                  {confirmed.measuredMass.kg.toLocaleString()} kg
                </span>{" "}
                <Badge tone="mint" glyph="✓">
                  weighed
                </Badge>
                <span className="ml-2 text-xs text-ink-muted">
                  from {confirmed.measuredMass.itemCount} item(s)
                </span>
              </KeyValue>
              <KeyValue label="Estimated">
                <span className="text-lg font-semibold tabular-nums text-ink-soft">
                  {confirmed.estimatedMass.kg.toLocaleString()} kg
                </span>{" "}
                <Badge tone="amber" glyph="≈">
                  owner estimate
                </Badge>
                <span className="ml-2 text-xs text-ink-muted">
                  from {confirmed.estimatedMass.itemCount} item(s)
                </span>
              </KeyValue>
              <KeyValue label="Not recorded">
                <Badge tone="outline" glyph="–">
                  {confirmed.unknownMassItemCount} item(s) excluded entirely
                </Badge>
              </KeyValue>
            </dl>
          </Card>

          <Card className="p-5">
            <h3 className="text-base">Reported replacement value</h3>
            <p className="mt-1 text-sm text-ink-muted">
              What donors said a comparable new item would cost. This is a reported figure, not a market
              valuation, and LoopProof does not verify it.
            </p>
            <dl className="mt-3 divide-y divide-line">
              <KeyValue label="Owner estimates">
                <span className="text-lg font-semibold tabular-nums text-ink-soft">
                  {confirmed.replacementValueOwnerEstimate.toLocaleString()}
                </span>{" "}
                <Badge tone="amber" glyph="≈">
                  estimate
                </Badge>
              </KeyValue>
              <KeyValue label="Supported by a quote">
                <span className="text-lg font-semibold tabular-nums text-forest-600">
                  {confirmed.replacementValueQuotedEvidence.toLocaleString()}
                </span>{" "}
                <Badge tone="mint" glyph="✓">
                  evidence held
                </Badge>
              </KeyValue>
              <KeyValue label="No value stated">
                <Badge tone="outline" glyph="–">
                  {confirmed.itemsWithoutValue} item(s)
                </Badge>
              </KeyValue>
            </dl>
          </Card>
        </div>
      </section>

      {/* ------------------------------------------------- not counted */}
      <section>
        <SectionHeading
          title="Counted separately, never as impact"
          description="These are activity, not outcomes. Keeping them visible is the point: an impact page that hides them is flattering, not accurate."
        />
        <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-7">
          <Stat label="Available listings" value={notCounted.availableListings} tone="muted" />
          <Stat label="Open requests" value={notCounted.openRequests} tone="muted" />
          <Stat label="Requests pending" value={notCounted.requestedTransfers} tone="muted" />
          <Stat label="Active reservations" value={notCounted.activeReservations} tone="muted" />
          <Stat label="Declined" value={notCounted.declinedTransfers} tone="muted" />
          <Stat label="Cancelled" value={notCounted.cancelledTransfers} tone="muted" />
          <Stat label="Disputed" value={notCounted.disputedTransfers} tone="muted" />
        </dl>
      </section>

      {/* --------------------------------------------------- emissions */}
      <section>
        <SectionHeading
          title="Emissions scenario"
          description="An avoided-emissions figure appears only when every factor behind it is present with a named source and version."
        />
        {emissions.available ? (
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="text-3xl font-semibold tabular-nums text-forest-600">
                {emissions.centralKg.toLocaleString()} kg CO<sub>2</sub>e
              </p>
              <Badge tone="amber" glyph="≈">
                estimated under these assumptions
              </Badge>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              Scenario range {emissions.lowKg.toLocaleString()} to {emissions.highKg.toLocaleString()} kg
              CO<sub>2</sub>e.
            </p>
            <dl className="mt-4 divide-y divide-line">
              <KeyValue label="Formula">
                <span className="lp-mono">{emissions.formula}</span>
              </KeyValue>
              <KeyValue label="Mass used">
                {emissions.massUsedKg.toLocaleString()} kg — {emissions.massBasisNote}
              </KeyValue>
              <KeyValue label="Assumed displacement rate">{emissions.displacementRate}</KeyValue>
            </dl>
            <h3 className="mt-5 text-base">Factors used</h3>
            <ul className="mt-2 space-y-2">
              {emissions.assumptions.map((a) => (
                <li key={a.key} className="rounded-lg border border-line bg-paper-sunken/40 p-3 text-sm">
                  <p className="font-semibold">{a.label}</p>
                  <p className="text-ink-soft">
                    {a.value} {a.unit} · source: {a.source || "not named"} · version:{" "}
                    {a.sourceVersion || "not stated"}
                  </p>
                </li>
              ))}
            </ul>
            <Callout tone="warn" title="Read this before quoting the number">
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {emissions.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
            </Callout>
          </Card>
        ) : (
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-2xl font-semibold text-ink-muted">No CO₂e figure is shown</p>
              <Badge tone="outline" glyph="–">
                deliberately withheld
              </Badge>
            </div>
            <p className="mt-2 text-ink-soft">{emissions.reason}</p>
            <h3 className="mt-5 text-base">What would be needed</h3>
            <ul className="mt-2 space-y-2">
              {emissions.missingInputs.map((input) => (
                <li key={input} className="flex gap-2.5 rounded-lg border border-line bg-paper-sunken/40 p-3 text-sm">
                  <span aria-hidden="true" className="font-mono font-bold text-amber-ink">
                    ?
                  </span>
                  <span>{input}</span>
                </li>
              ))}
            </ul>
            <Callout tone="info" title="The scenario LoopProof would use">
              <p className="lp-mono">
                net avoided kg CO2e = (recorded mass kg x displaced-production factor x displacement rate) −
                (units x (transport + refurbishment per unit))
              </p>
              <p className="mt-2">
                All five inputs are defined in the database with a place for their source and version. The
                moment defensible values are recorded there, the figure appears with its assumptions, its range
                and its missing inputs shown alongside. Inventing a convenient factor would make the number
                worse than no number.
              </p>
            </Callout>
          </Card>
        )}
      </section>

      {/* ------------------------------------------------- assumptions */}
      <section>
        <SectionHeading
          title="Every assumption on the record"
          description="Nothing on this page is computed from a number that is not listed here."
        />
        <Card className="p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Impact assumptions and their availability</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Assumption
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Value
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Source / version
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {assumptions.map((a) => (
                  <tr key={a.key} className="border-b border-line/60 align-top">
                    <th scope="row" className="py-2.5 pr-4 text-left font-medium">
                      {a.label}
                      <span className="mt-0.5 block lp-mono text-ink-muted">{a.key}</span>
                    </th>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {a.value != null ? `${a.value} ${a.unit}` : "—"}
                    </td>
                    <td className="py-2.5 pr-4">
                      {a.source ? `${a.source}${a.sourceVersion ? ` (${a.sourceVersion})` : ""}` : "not named"}
                    </td>
                    <td className="py-2.5">
                      {a.isAvailable ? (
                        <Badge tone="mint" glyph="✓">
                          Available
                        </Badge>
                      ) : (
                        <Badge tone="amber" glyph="?">
                          Not defensible yet
                        </Badge>
                      )}
                      {a.notes ? <p className="mt-1 max-w-sm text-xs text-ink-muted">{a.notes}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* ---------------------------------------------- evidence quality */}
      <section>
        <SectionHeading
          title="Evidence quality behind these numbers"
          description="How much of the confirmed activity rests on a documented test or a recipient's own confirmation."
        />
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Completed items with a documented test"
            value={dataQuality.completedItemsWithTestEvidence}
            unit={`of ${confirmed.itemCount}`}
          />
          <Stat
            label="With recipient confirmation on receipt"
            value={dataQuality.completedItemsWithRecipientConfirmation}
            unit={`of ${confirmed.itemCount}`}
          />
          <Stat label="Mass measured" value={dataQuality.completedItemsWithMeasuredMass} tone="muted" />
          <Stat label="Mass estimated" value={dataQuality.completedItemsWithEstimatedMass} tone="muted" />
        </dl>
      </section>

      <Disclosure summary="Technical note on how these figures are produced">
        <div className="space-y-2 text-sm text-ink-soft">
          <p>
            Figures are computed on request from the database in{" "}
            <code className="lp-mono">src/lib/impact.ts</code>. The counting rule is a single constant,{" "}
            <code className="lp-mono">IMPACT_COUNTED_STATES = [&quot;completed&quot;]</code>, shared with the
            transfer state machine. Completed rows are additionally re-checked for both acknowledgment flags,
            and a database CHECK constraint refuses to store a completed transfer missing either one.
          </p>
          <p>
            Mass is multiplied by the transfer quantity, not by the listing quantity, so a donor offering four
            monitors and transferring one is credited with one.
          </p>
          <p>
            No chart on this page is populated with a hardcoded number.{" "}
            <Link href="/about">See the architecture notes</Link> for the full data model.
          </p>
        </div>
      </Disclosure>

      <Callout tone="warn" title="LoopProof issues nothing tradable">
        No carbon credits, tokens or environmental certificates are issued. These figures are an internal record
        of what was transferred and what evidence supports it, reported with their limitations attached.
      </Callout>
    </div>
  );
}
