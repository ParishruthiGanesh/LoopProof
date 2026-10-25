import { Badge } from "./ui";

type Entry = {
  id: string;
  kind: string;
  fromState: string | null;
  toState: string | null;
  actorOrgName: string | null;
  note: string;
  createdAt: string;
};

const KIND_LABELS: Record<string, string> = {
  request_submitted: "Request submitted",
  accept: "Request accepted, item reserved",
  decline: "Request declined",
  withdraw: "Request withdrawn",
  cancel: "Reservation cancelled",
  record_release: "Donor recorded release",
  record_receipt: "Recipient recorded receipt",
  report_problem: "Problem reported",
  superseded: "Superseded by another reservation",
  evidence_changed: "Public evidence changed",
};

export function TransferTimeline({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) {
    return <p className="mt-3 text-sm text-ink-muted">No events recorded yet.</p>;
  }
  return (
    <ol className="mt-4 space-y-0">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-4 pb-5 last:pb-0">
          <div className="flex flex-col items-center">
            <span
              aria-hidden="true"
              className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${
                entry.kind === "report_problem"
                  ? "border-clay bg-clay-soft"
                  : entry.kind === "record_receipt"
                    ? "border-forest-600 bg-forest-600"
                    : "border-forest-400 bg-paper-raised"
              }`}
            />
            {index < entries.length - 1 ? <span aria-hidden="true" className="mt-1 w-px flex-1 bg-line-strong" /> : null}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="font-semibold text-ink">{KIND_LABELS[entry.kind] ?? entry.kind.replace(/_/g, " ")}</p>
              <time className="text-xs text-ink-muted" dateTime={entry.createdAt}>
                {entry.createdAt.slice(0, 16).replace("T", " ")}
              </time>
            </div>
            <p className="text-xs text-ink-muted">
              {entry.actorOrgName ? `by ${entry.actorOrgName}` : "system"}
              {entry.fromState && entry.toState && entry.fromState !== entry.toState ? (
                <>
                  {" · "}
                  <span className="lp-mono">
                    {entry.fromState} &rarr; {entry.toState}
                  </span>
                </>
              ) : null}
            </p>
            {entry.note ? <p className="mt-1 text-sm text-ink-soft">{entry.note}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
