"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Select, TextArea, TextInput } from "./controls";
import { Callout } from "./ui";

export function RequestItemForm({
  itemId,
  maxQuantity,
  requests,
}: {
  itemId: string;
  maxQuantity: number;
  requests: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [quantity, setQuantity] = useState(Math.min(1, maxQuantity));
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/transfers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, message, quantity, requestId: requestId || null }),
    });
    const data = (await response.json()) as { ok?: boolean; transferId?: string; error?: string };
    setBusy(false);
    if (!response.ok || !data.ok) {
      setError(data.error ?? "Could not submit the request.");
      return;
    }
    router.push(`/transfers/${data.transferId}`);
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-4">
      <Field
        label="Quantity needed"
        required
        hint={`Up to ${maxQuantity} available.`}
        htmlFor="request-quantity"
      >
        <TextInput
          id="request-quantity"
          type="number"
          min={1}
          max={maxQuantity}
          required
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </Field>

      {requests.length > 0 ? (
        <Field
          label="Link to one of your open requests"
          hint="Linking lets the donor see the requirements you published."
          htmlFor="request-link"
        >
          <Select id="request-link" value={requestId} onChange={(e) => setRequestId(e.target.value)}>
            <option value="">Do not link to a request</option>
            {requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} — {r.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field
        label="Message to the donor"
        required
        hint="What you need it for, and when you could collect. Both organizations can see this; it is not published publicly."
        htmlFor="request-message"
      >
        <TextArea
          id="request-message"
          required
          minLength={5}
          maxLength={1000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="We need four monitors for an adult digital-skills class and can collect with a van on weekday mornings."
        />
      </Field>

      <Button type="submit" loading={busy}>
        Submit request
      </Button>
      {error ? <Callout tone="problem">{error}</Callout> : null}
    </form>
  );
}
