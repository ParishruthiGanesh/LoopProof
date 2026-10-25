"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./controls";
import { Callout } from "./ui";

/** Retrying is idempotent: the same key is reused, so a transaction that
 *  already succeeded is never sent twice. */
export function RetryAnchor({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setNote(null);
          const response = await fetch(`/api/chain/retry/${id}`, { method: "POST" });
          const data = await response.json();
          setBusy(false);
          setNote(
            data.status
              ? `Status is now "${data.status}"${data.deduplicated ? " (no new transaction was sent)" : ""}${data.error ? `: ${data.error}` : ""}.`
              : (data.error as string) ?? "Retry failed.",
          );
          router.refresh();
        }}
      >
        Retry anchoring
      </Button>
      {note ? <Callout tone="neutral">{note}</Callout> : null}
    </div>
  );
}
