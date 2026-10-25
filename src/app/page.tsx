import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { Card, Badge, SectionHeading } from "@/components/ui";
import { Button } from "@/components/controls";
import { photoUrl } from "@/lib/uploads";
import { labelCondition } from "@/lib/matching";

export default async function HomePage() {
  const [user, headline] = await Promise.all([getSessionUser(), loadHeadline()]);

  return (
    <div className="space-y-12">
      <section className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div className="space-y-5">
          <Badge tone="mint" glyph="♻">
            Sustainable Supply Chains · IEEE ClimateChain Global Hackathon
          </Badge>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
            Give equipment a second life.
            <span className="block text-forest-600">Keep the proof.</span>
          </h1>
          <p className="max-w-xl text-base text-ink-soft">
            A university department has a working monitor it no longer needs. A community classroom needs one.
            LoopProof turns photographs into a useful listing, matches it against what the classroom actually
            asked for, coordinates the handoff, and leaves behind a QR-linked passport holding the condition
            evidence and both organizations&rsquo; acknowledgments.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={user ? "/dashboard" : "/signin"} className="no-underline hover:no-underline">
              <Button>{user ? "Go to your overview" : "Enter a demonstration account"}</Button>
            </Link>
            <Link href="/marketplace" className="no-underline hover:no-underline">
              <Button variant="secondary">Browse available equipment</Button>
            </Link>
          </div>
          <p className="text-sm text-ink-muted">
            LoopProof reduces the friction in arranging reuse and improves the traceability of what was
            transferred. It is not the first reuse marketplace, and it is not a certified carbon-credit platform.
          </p>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-line bg-paper-sunken/60 px-5 py-3">
            <p className="text-sm font-semibold text-ink">Available right now</p>
            <p className="text-xs text-ink-muted">
              Live from the database. Seeded examples are labelled as demonstration data.
            </p>
          </div>
          <ul className="divide-y divide-line">
            {headline.map((entry) => (
              <li key={entry.id} className="flex gap-4 px-5 py-4">
                <img
                  src={entry.photo ?? "/items/monitor-24.svg"}
                  alt=""
                  width={88}
                  height={66}
                  className="h-16 w-22 shrink-0 rounded-lg border border-line bg-paper-sunken object-cover"
                />
                <div className="min-w-0 flex-1">
                  <Link href={`/marketplace/${entry.id}`} className="font-semibold no-underline">
                    {entry.title}
                  </Link>
                  <p className="truncate text-xs text-ink-muted">
                    {labelCondition(entry.conditionGrade)} · {entry.locationRegion}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {entry.isDemo ? (
                      <Badge tone="amber" glyph="◆">
                        Demonstration data
                      </Badge>
                    ) : (
                      <Badge tone="lime" glyph="＋">
                        Created here
                      </Badge>
                    )}
                  </div>
                </div>
              </li>
            ))}
            {headline.length === 0 ? (
              <li className="px-5 py-8 text-sm text-ink-muted">
                No listings yet. Run <code className="lp-mono">npm run db:reset</code> to load the demonstration
                data.
              </li>
            ) : null}
          </ul>
        </Card>
      </section>

      <section>
        <SectionHeading
          title="How LoopProof works"
          description="Five steps, each one leaving a record that the other organization can check."
        />
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, index) => (
            <Card as="li" key={step.title} className="p-5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-forest-600 text-sm font-bold text-white">
                {index + 1}
              </span>
              <h3 className="mt-3 text-base">{step.title}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{step.body}</p>
            </Card>
          ))}
        </ol>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="text-base">Evidence has a provenance</h3>
          <p className="mt-2 text-sm text-ink-soft">
            Every claim about an item is labelled with where it came from: <strong>owner reported</strong>,{" "}
            <strong>documented test</strong>, or <strong>recipient confirmed</strong>. A suggestion from a
            photograph stays marked unconfirmed until the owner ticks it off, and never reaches the public
            manifest until they do.
          </p>
        </Card>
        <Card className="p-5">
          <h3 className="text-base">Two signatures, not one database</h3>
          <p className="mt-2 text-sm text-ink-soft">
            A transfer completes only when the donor records release <em>and</em> the recipient records receipt.
            Both acknowledgments and a digest of the public evidence are written to a shared contract, so neither
            organization&rsquo;s own editable database is the only account of what happened.
          </p>
        </Card>
        <Card className="p-5">
          <h3 className="text-base">Impact only when it is confirmed</h3>
          <p className="mt-2 text-sm text-ink-soft">
            Publishing a listing earns nothing. Only completed transfers count, mass is reported separately for
            measured and estimated values, and no CO<sub>2</sub>e figure appears unless every factor behind it has
            a named source. Where it does not, LoopProof says what is missing instead.
          </p>
        </Card>
      </section>
    </div>
  );
}

const STEPS = [
  {
    title: "Photograph it",
    body: "Upload up to three photographs of a surplus item from a phone or a laptop.",
  },
  {
    title: "Confirm the draft",
    body: "A draft title, category and visible specifications come back, with questions only the owner can answer. Nothing publishes until the owner confirms each field.",
  },
  {
    title: "Find a recipient",
    body: "Recipients describe what they need in plain language plus structured requirements. Matching explains why each candidate fits, and rejects the ones that cannot.",
  },
  {
    title: "Complete the handoff",
    body: "One request is accepted and the item is reserved. The donor records release, the recipient records receipt or reports a problem.",
  },
  {
    title: "Inspect the evidence",
    body: "A QR-linked passport shows the timeline, both acknowledgments, and whether the public evidence still matches its anchored digest.",
  },
];

async function loadHeadline() {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.items.id,
      title: schema.items.title,
      conditionGrade: schema.items.conditionGrade,
      locationRegion: schema.items.locationRegion,
      isDemo: schema.items.isDemo,
    })
    .from(schema.items)
    .where(eq(schema.items.status, "available"))
    .limit(4);

  const ids = rows.map((r) => r.id);
  const photos = ids.length
    ? await db.select().from(schema.itemPhotos).where(inArray(schema.itemPhotos.itemId, ids))
    : [];

  return rows.map((row) => ({
    ...row,
    photo: (() => {
      const p = photos.filter((x) => x.itemId === row.id).sort((a, b) => a.sortOrder - b.sortOrder)[0];
      return p ? photoUrl(p.storedPath) : null;
    })(),
  }));
}
