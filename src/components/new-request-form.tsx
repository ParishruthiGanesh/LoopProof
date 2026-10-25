"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Checkbox, Field, Select, TextArea, TextInput } from "./controls";
import { Callout } from "./ui";

type SpecRow = { label: string; value: string; required: boolean };

export function NewRequestForm({ orgRegion }: { orgRegion: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [freeText, setFreeText] = useState("");
  const [category, setCategory] = useState("monitor");
  const [quantity, setQuantity] = useState(1);
  const [minConditionGrade, setMinConditionGrade] = useState("working_marks");
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [maxDistanceKm, setMaxDistanceKm] = useState("25");
  const [collectionDeadline, setCollectionDeadline] = useState("");
  const [needsCables, setNeedsCables] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        freeText: freeText.trim(),
        category,
        quantity,
        minConditionGrade,
        requiredSpecs: specs.filter((s) => s.label.trim() && s.value.trim()),
        maxDistanceKm: maxDistanceKm.trim() === "" ? null : Number(maxDistanceKm),
        collectionDeadline: collectionDeadline || null,
        needsCablesIncluded: needsCables,
      }),
    });
    const data = (await response.json()) as { ok?: boolean; requestId?: string; error?: string };
    setBusy(false);
    if (!response.ok || !data.ok) {
      setError(data.error ?? "Could not post the request.");
      return;
    }
    router.push(`/requests/${data.requestId}`);
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="What do you need?" required htmlFor="req-title">
        <TextInput
          id="req-title"
          required
          minLength={5}
          maxLength={140}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Four monitors for an adult digital-skills classroom"
        />
      </Field>

      <Field
        label="Describe it in your own words"
        required
        hint="Plain language. This is what semantic matching interprets when a model key is configured; the structured fields below are always checked as hard rules."
        htmlFor="req-text"
      >
        <TextArea
          id="req-text"
          required
          minLength={10}
          maxLength={2000}
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="We are setting up four workstations for an evening class. Monitors must definitely work and be big enough for two windows side by side. We can collect with a van within three weeks."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" required htmlFor="req-category">
          <Select id="req-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="monitor">Monitor</option>
            <option value="peripheral">Peripheral</option>
            <option value="small_electronics">Small electronics</option>
            <option value="networking">Networking</option>
            <option value="furniture">Furniture</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Quantity" required htmlFor="req-quantity">
          <TextInput
            id="req-quantity"
            type="number"
            min={1}
            max={500}
            required
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </Field>
        <Field
          label="Lowest condition you can accept"
          required
          hint="Anything below this is rejected as ineligible rather than ranked low."
          htmlFor="req-condition"
        >
          <Select
            id="req-condition"
            value={minConditionGrade}
            onChange={(e) => setMinConditionGrade(e.target.value)}
          >
            <option value="working_good">Working, good condition</option>
            <option value="working_marks">Working, cosmetic marks acceptable</option>
            <option value="working_defects">Working with known defects acceptable</option>
            <option value="untested">Untested acceptable</option>
            <option value="parts_only">For parts only acceptable</option>
          </Select>
        </Field>
        <Field label="Maximum distance (km)" hint="Leave blank for no limit." htmlFor="req-distance">
          <TextInput
            id="req-distance"
            type="number"
            min="1"
            value={maxDistanceKm}
            onChange={(e) => setMaxDistanceKm(e.target.value)}
          />
        </Field>
        <Field label="Collection deadline" htmlFor="req-deadline">
          <TextInput
            id="req-deadline"
            type="date"
            value={collectionDeadline}
            onChange={(e) => setCollectionDeadline(e.target.value)}
          />
        </Field>
        <Field label="Your area" htmlFor="req-region" hint="Taken from your organization's profile.">
          <TextInput id="req-region" value={orgRegion} readOnly aria-readonly="true" className="bg-paper-sunken" />
        </Field>
      </div>

      <Checkbox
        checked={needsCables}
        onChange={(e) => setNeedsCables(e.target.checked)}
        label="Cables must be included"
        hint="Listings where the donor recorded that cables are not included will be rejected."
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Required specifications</h3>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setSpecs((prev) => [...prev, { label: "", value: "", required: true }])}
          >
            Add
          </Button>
        </div>
        {specs.length === 0 ? (
          <p className="text-sm text-ink-muted">
            None. Add one if you need something specific, for example{" "}
            <span className="lp-mono">Native resolution</span> of <span className="lp-mono">&gt;=1920</span>.
          </p>
        ) : null}
        <ul className="space-y-3">
          {specs.map((spec, index) => (
            <li key={index} className="rounded-lg border border-line bg-paper-sunken/40 p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Field label="Specification" htmlFor={`req-spec-label-${index}`}>
                  <TextInput
                    id={`req-spec-label-${index}`}
                    value={spec.label}
                    onChange={(e) =>
                      setSpecs((prev) => prev.map((s, i) => (i === index ? { ...s, label: e.target.value } : s)))
                    }
                    placeholder="Native resolution"
                  />
                </Field>
                <Field label="Needed value" htmlFor={`req-spec-value-${index}`}>
                  <TextInput
                    id={`req-spec-value-${index}`}
                    value={spec.value}
                    onChange={(e) =>
                      setSpecs((prev) => prev.map((s, i) => (i === index ? { ...s, value: e.target.value } : s)))
                    }
                    placeholder=">=1920"
                  />
                </Field>
                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => setSpecs((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              <div className="mt-2">
                <Checkbox
                  checked={spec.required}
                  onChange={(e) =>
                    setSpecs((prev) => prev.map((s, i) => (i === index ? { ...s, required: e.target.checked } : s)))
                  }
                  label="Hard requirement"
                  hint="If ticked, a listing that does not meet it is rejected. If not, it only affects ranking."
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Button type="submit" loading={busy}>
        Post request and find matches
      </Button>
      {error ? <Callout tone="problem">{error}</Callout> : null}
    </form>
  );
}
