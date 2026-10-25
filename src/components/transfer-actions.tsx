"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Checkbox, Field, TextArea } from "./controls";
import { Callout, Badge } from "./ui";

type Action = { action: string; to: string; label: string };

const DESTRUCTIVE = new Set(["decline", "withdraw", "cancel", "report_problem"]);

const HELP: Record<string, string> = {
  accept:
    "Reserves the item for this recipient and declines the other open requests for it. The reservation is written to the shared contract.",
  decline: "Closes this request. The item stays available for others.",
  withdraw: "Closes your own request. The item stays available for others.",
  cancel:
    "Ends the reservation. The item becomes available again and the cancellation is recorded on chain, not erased.",
  record_release:
    "Records that the item physically left your possession. This is your half of the acknowledgment.",
  record_receipt:
    "Records that you received the item. Completion needs both acknowledgments, so this closes the transfer.",
  report_problem:
    "Records a dispute instead of a receipt. The transfer is excluded from confirmed impact totals and earlier acknowledgments stay on the record.",
};

export function TransferActions({
  transferId,
  state,
  role,
  actions,
  requiresReacknowledgement,
}: {
  transferId: string;
  state: string;
  role: "donor" | "recipient";
  actions: Action[];
  requiresReacknowledgement: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [conditionConfirmed, setConditionConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  if (actions.length === 0) {
    return (
      <p className="mt-2 text-sm text-ink-soft">
        Nothing is waiting on you. This transfer is in state <span className="lp-mono">{state}</span>.
      </p>
    );
  }

  const run = async (action: string) => {
    setBusy(true);
    setError(null);
    setResult(null);
    const response = await fetch(`/api/transfers/${transferId}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        note,
        ...(action === "record_receipt" ? { conditionConfirmed } : {}),
      }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok || !data.ok) {
      setError(data.error ?? "That action could not be completed.");
      return;
    }
    const anchor = data.anchor as { status?: string; txHash?: string; error?: string } | null;
    setResult(
      `Moved from "${data.fromState}" to "${data.toState}".` +
        (anchor
          ? ` Blockchain status: ${anchor.status}${anchor.error ? ` — ${anchor.error}` : ""}.`
          : " Nothing was anchored for this step, by design.") +
        (Array.isArray(data.supersededTransferIds) && data.supersededTransferIds.length > 0
          ? ` ${data.supersededTransferIds.length} other request(s) were declined.`
          : ""),
    );
    setSelected(null);
    setNote("");
    setConditionConfirmed(false);
    router.refresh();
  };

  return (
    <div className="mt-3 space-y-4">
      <ul className="space-y-2">
        {actions.map((action) => (
          <li key={action.action} className="rounded-lg border border-line bg-paper-sunken/40 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ink">{action.label}</p>
              <Badge tone="outline" glyph="→">
                {action.to}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-ink-soft">{HELP[action.action] ?? ""}</p>
            <div className="mt-2.5">
              {selected === action.action ? (
                <div className="space-y-3">
                  {action.action === "record_receipt" ? (
                    <>
                      <Checkbox
                        checked={conditionConfirmed}
                        onChange={(e) => setConditionConfirmed(e.target.checked)}
                        label="The item matched the published condition"
                        hint="Ticking this records recipient-confirmed evidence against the item. If it did not match, use 'Report a problem' instead."
                      />
                      {requiresReacknowledgement && !conditionConfirmed ? (
                        <Callout tone="warn">
                          The public evidence changed after your reservation. You must review it and confirm before
                          receipt can be recorded.
                        </Callout>
                      ) : null}
                    </>
                  ) : null}
                  <Field
                    label={action.action === "report_problem" ? "What went wrong?" : "Note (shown to both parties)"}
                    required={action.action === "report_problem"}
                    hint={
                      action.action === "report_problem"
                        ? "Published in the timeline and recorded as evidence. Only a digest of it goes on chain."
                        : undefined
                    }
                    htmlFor={`note-${action.action}`}
                  >
                    <TextArea
                      id={`note-${action.action}`}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={500}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={DESTRUCTIVE.has(action.action) ? "danger" : "primary"}
                      loading={busy}
                      disabled={action.action === "report_problem" && note.trim().length < 5}
                      onClick={() => run(action.action)}
                    >
                      Confirm: {action.label}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant={DESTRUCTIVE.has(action.action) ? "secondary" : "primary"}
                  onClick={() => {
                    setSelected(action.action);
                    setError(null);
                    setResult(null);
                  }}
                >
                  {action.label}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {result ? <Callout tone="info">{result}</Callout> : null}
      {error ? <Callout tone="problem">{error}</Callout> : null}

      <p className="text-xs text-ink-muted">
        You are acting as the <strong>{role}</strong>. Which actions exist is decided by the server from your
        session, not by the interface.
      </p>
    </div>
  );
}
