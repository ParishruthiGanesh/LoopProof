"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./controls";

export function RematchButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="secondary"
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setNote(null);
          const response = await fetch(`/api/requests/${requestId}/match`, { method: "POST" });
          const data = await response.json();
          setBusy(false);
          setNote(
            data.ok
              ? `Recomputed: ${data.eligibleCount} eligible, ${data.ineligibleCount} incompatible (${data.method === "rules_and_semantic" ? "rules and semantic" : "rules only"}).`
              : (data.error as string),
          );
          router.refresh();
        }}
      >
        Recompute matches
      </Button>
      {note ? (
        <span role="status" className="text-xs text-ink-muted">
          {note}
        </span>
      ) : null}
    </div>
  );
}
