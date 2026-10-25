import type { ReactNode } from "react";

/* Shared presentational primitives. Status is never conveyed by colour alone:
   every badge carries a word, and most carry a glyph as well. */

export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return <Tag className={`lp-card lp-shadow ${className}`}>{children}</Tag>;
}

export function SectionHeading({
  title,
  description,
  actions,
  level = 2,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  level?: 1 | 2 | 3;
}) {
  const Tag = (`h${level}` as const) satisfies "h1" | "h2" | "h3";
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-2xl">
        <Tag className={level === 1 ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"}>{title}</Tag>
        {description ? <p className="mt-1.5 text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type BadgeTone = "neutral" | "forest" | "mint" | "lime" | "amber" | "clay" | "outline";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-paper-sunken text-ink-soft border-line-strong",
  forest: "bg-forest-600 text-white border-forest-700",
  mint: "bg-mint-soft text-forest-700 border-forest-200",
  lime: "bg-lime-soft text-forest-700 border-lime",
  amber: "bg-amber-soft text-amber-ink border-[#e6cf9a]",
  clay: "bg-clay-soft text-clay border-[#e3bca8]",
  outline: "bg-transparent text-ink-soft border-line-strong",
};

export function Badge({
  children,
  tone = "neutral",
  glyph,
  title,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  /** Short text glyph so the badge reads without colour. */
  glyph?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${BADGE_TONES[tone]}`}
    >
      {glyph ? (
        <span aria-hidden="true" className="font-mono leading-none">
          {glyph}
        </span>
      ) : null}
      {children}
    </span>
  );
}

/** Evidence provenance, shown wherever a claim about an item appears. */
export function EvidenceBadge({ source }: { source: string }) {
  switch (source) {
    case "documented_test":
      return (
        <Badge tone="mint" glyph="✓" title="A test was carried out and recorded.">
          Documented test
        </Badge>
      );
    case "recipient_confirmed":
      return (
        <Badge tone="forest" glyph="★" title="The receiving organization confirmed this.">
          Recipient confirmed
        </Badge>
      );
    case "owner_reported":
      return (
        <Badge tone="outline" glyph="•" title="Stated by the owner; not independently tested.">
          Owner reported
        </Badge>
      );
    case "ai_suggested_unconfirmed":
      return (
        <Badge tone="amber" glyph="?" title="Suggested from a photograph and not yet confirmed by the owner.">
          AI suggested, unconfirmed
        </Badge>
      );
    default:
      return <Badge tone="neutral">{source}</Badge>;
  }
}

export function DemoBadge({ children = "Demonstration data" }: { children?: ReactNode }) {
  return (
    <Badge tone="amber" glyph="◆" title="Seeded example record, excluded from real activity totals.">
      {children}
    </Badge>
  );
}

export function RealBadge() {
  return (
    <Badge tone="lime" glyph="＋" title="Created in this application, not seeded.">
      Created here
    </Badge>
  );
}

/** Honest on-chain status labels. */
export function ChainStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "confirmed":
      return (
        <Badge tone="forest" glyph="⛓" title="A transaction receipt confirmed this on the local development chain.">
          Confirmed on local dev chain
        </Badge>
      );
    case "pending":
      return (
        <Badge tone="amber" glyph="◴" title="Sent, but no receipt has confirmed it yet.">
          Awaiting confirmation
        </Badge>
      );
    case "failed":
      return (
        <Badge tone="clay" glyph="✕" title="The transaction failed or was rejected. Nothing was anchored.">
          Failed
        </Badge>
      );
    case "simulated":
      return (
        <Badge tone="amber" glyph="◇" title="Simulation mode is explicitly enabled; no chain was used.">
          Simulated
        </Badge>
      );
    default:
      return (
        <Badge tone="outline" glyph="○" title="Nothing has been anchored for this record.">
          Not anchored
        </Badge>
      );
  }
}

export function TransferStateBadge({ state }: { state: string }) {
  const map: Record<string, { tone: BadgeTone; glyph: string; label: string }> = {
    requested: { tone: "amber", glyph: "◴", label: "Request submitted" },
    declined: { tone: "neutral", glyph: "–", label: "Declined" },
    reserved: { tone: "mint", glyph: "◆", label: "Reserved" },
    released: { tone: "lime", glyph: "→", label: "Released by donor" },
    completed: { tone: "forest", glyph: "✓", label: "Completed" },
    cancelled: { tone: "neutral", glyph: "✕", label: "Cancelled" },
    disputed: { tone: "clay", glyph: "!", label: "Disputed" },
  };
  const entry = map[state] ?? { tone: "neutral" as BadgeTone, glyph: "•", label: state };
  return (
    <Badge tone={entry.tone} glyph={entry.glyph}>
      {entry.label}
    </Badge>
  );
}

export function ItemStatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: BadgeTone; glyph: string; label: string }> = {
    draft: { tone: "neutral", glyph: "✎", label: "Draft" },
    available: { tone: "lime", glyph: "●", label: "Available" },
    reserved: { tone: "amber", glyph: "◆", label: "Reserved" },
    transferred: { tone: "forest", glyph: "✓", label: "Transferred" },
    withdrawn: { tone: "neutral", glyph: "–", label: "Withdrawn" },
  };
  const entry = map[status] ?? { tone: "neutral" as BadgeTone, glyph: "•", label: status };
  return (
    <Badge tone={entry.tone} glyph={entry.glyph}>
      {entry.label}
    </Badge>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-paper-sunken/50 px-6 py-10 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  note,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  tone?: "default" | "muted" | "withheld";
}) {
  return (
    <div className="rounded-card border border-line bg-paper-raised px-4 py-3.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1">
        <span
          className={`text-2xl font-semibold tabular-nums ${
            tone === "withheld" ? "text-ink-muted" : tone === "muted" ? "text-ink-soft" : "text-forest-600"
          }`}
        >
          {value}
        </span>
        {unit ? <span className="ml-1 text-sm text-ink-soft">{unit}</span> : null}
        {note ? <p className="mt-1 text-xs leading-snug text-ink-muted">{note}</p> : null}
      </dd>
    </div>
  );
}

export function Callout({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "info" | "warn" | "problem";
  title?: ReactNode;
  children: ReactNode;
}) {
  const styles = {
    neutral: "border-line bg-paper-sunken/60 text-ink-soft",
    info: "border-forest-200 bg-mint-soft text-forest-700",
    warn: "border-[#e6cf9a] bg-amber-soft text-amber-ink",
    problem: "border-[#e3bca8] bg-clay-soft text-clay",
  }[tone];
  const glyph = { neutral: "•", info: "i", warn: "!", problem: "✕" }[tone];
  return (
    <div className={`rounded-card border px-4 py-3 text-sm ${styles}`}>
      <div className="flex gap-2.5">
        <span aria-hidden="true" className="mt-0.5 font-mono font-bold leading-none">
          {glyph}
        </span>
        <div className="min-w-0 flex-1">
          {title ? <p className="font-semibold">{title}</p> : null}
          <div className={title ? "mt-1" : ""}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-sm text-ink-muted sm:w-52">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

/** Expandable section used for wallet addresses and transaction detail, so
 *  ordinary users are never confronted with them. */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="rounded-card border border-line bg-paper-sunken/40">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-semibold text-forest-600 marker:content-none">
        <span className="mr-1.5 inline-block" aria-hidden="true">
          ▸
        </span>
        {summary}
      </summary>
      <div className="border-t border-line px-4 py-3">{children}</div>
    </details>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="space-y-3 text-ink-soft [&_strong]:text-ink">{children}</div>;
}
