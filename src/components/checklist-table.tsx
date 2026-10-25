import { Badge } from "./ui";

type Checklist = {
  powersOn: string;
  displayWorks: string;
  portsTested: string;
  cablesIncluded: string;
  notes: string;
  testedAt: string | null;
};

const ROWS: Array<{ key: keyof Checklist; label: string }> = [
  { key: "powersOn", label: "Powers on" },
  { key: "displayWorks", label: "Display works" },
  { key: "portsTested", label: "Ports tested" },
  { key: "cablesIncluded", label: "Cables included" },
];

function resultBadge(value: string) {
  switch (value) {
    case "pass":
    case "yes":
      return (
        <Badge tone="mint" glyph="✓">
          {value === "yes" ? "Included" : "Pass"}
        </Badge>
      );
    case "fail":
    case "no":
      return (
        <Badge tone="clay" glyph="✕">
          {value === "no" ? "Not included" : "Fail"}
        </Badge>
      );
    case "partial":
      return (
        <Badge tone="amber" glyph="◐">
          Partial
        </Badge>
      );
    case "not_applicable":
      return (
        <Badge tone="outline" glyph="–">
          Not applicable
        </Badge>
      );
    default:
      return (
        <Badge tone="amber" glyph="?">
          Not tested
        </Badge>
      );
  }
}

export function ChecklistTable({ checklist }: { checklist: Checklist }) {
  return (
    <div className="mt-3">
      <table className="w-full text-sm">
        <caption className="sr-only">Testing checklist results</caption>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className="border-b border-line/60">
              <th scope="row" className="py-2 pr-4 text-left font-medium">
                {row.label}
              </th>
              <td className="py-2">{resultBadge(String(checklist[row.key]))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {checklist.notes ? <p className="mt-3 text-sm text-ink-soft">{checklist.notes}</p> : null}
      {checklist.testedAt ? (
        <p className="mt-1.5 text-xs text-ink-muted">Recorded {checklist.testedAt.slice(0, 10)}.</p>
      ) : null}
      <p className="mt-2 text-xs text-ink-muted">
        A checklist records what someone tested and found. It is not a safety certification, and LoopProof does
        not verify it independently.
      </p>
    </div>
  );
}
