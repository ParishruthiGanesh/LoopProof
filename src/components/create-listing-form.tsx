"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, Checkbox, Field, RadioGroup, Select, TextArea, TextInput } from "./controls";
import { Badge, Callout, EvidenceBadge } from "./ui";

type Example = { key: string; label: string; describes: string };

type SpecDraft = {
  label: string;
  value: string;
  source: "owner_reported" | "documented_test" | "ai_suggested_unconfirmed";
  basis: string;
  confirmed: boolean;
  fromAi: boolean;
};

type Analysis = {
  suggestedCategory: string;
  suggestedTitle: string;
  visibleBrand: string;
  visibleModel: string;
  visibleSpecifications: Array<{ label: string; value: string; evidence: string }>;
  visibleDamage: Array<{ observation: string; location: string; severityWording: string }>;
  uncertainFields: string[];
  questionsForOwner: Array<{ question: string; field: string; whyItMatters: string }>;
  draftDescription: string;
  notAssessableFromPhoto: string[];
};

type AnalysisState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "live"; analysis: Analysis; model: string; latencyMs: number }
  | { kind: "example"; analysis: Analysis; label: string; describes: string; disclaimer: string }
  | { kind: "error"; message: string; retryable: boolean };

const CATEGORIES = [
  { value: "monitor", label: "Monitor" },
  { value: "peripheral", label: "Peripheral (keyboard, mouse, webcam, dock)" },
  { value: "small_electronics", label: "Small electronics (desktop, projector)" },
  { value: "networking", label: "Networking equipment" },
  { value: "furniture", label: "Furniture" },
  { value: "other", label: "Other" },
];

const CONDITIONS = [
  { value: "working_good", label: "Working, good condition", description: "Tested and works; no significant marks." },
  { value: "working_marks", label: "Working, cosmetic marks", description: "Tested and works; visible wear." },
  { value: "working_defects", label: "Working with known defects", description: "Usable, but something is wrong and you have said what." },
  { value: "untested", label: "Untested", description: "You have not tested it and are not claiming it works." },
  { value: "parts_only", label: "For parts only", description: "Not usable as intended; offered for parts recovery." },
];

export function CreateListingForm({
  orgRegion,
  aiLiveEnabled,
  aiModel,
  maxPhotos,
  maxBytes,
  examples,
}: {
  orgRegion: string;
  aiLiveEnabled: boolean;
  aiModel: string;
  maxPhotos: number;
  maxBytes: number;
  examples: Example[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [ownerHint, setOwnerHint] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisState>({ kind: "idle" });
  const [answered, setAnswered] = useState<Record<number, boolean>>({});

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("monitor");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [conditionGrade, setConditionGrade] = useState("working_good");
  const [quantity, setQuantity] = useState(1);
  const [massKg, setMassKg] = useState("");
  const [massBasis, setMassBasis] = useState<"measured" | "estimated" | "unknown">("unknown");
  const [replacementValue, setReplacementValue] = useState("");
  const [replacementValueBasis, setReplacementValueBasis] = useState<"owner_estimate" | "quoted_evidence" | "unknown">(
    "unknown",
  );
  const [locationRegion, setLocationRegion] = useState(orgRegion);
  const [collectionAddress, setCollectionAddress] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [knownDefects, setKnownDefects] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  const [ownerStatement, setOwnerStatement] = useState("");
  const [specs, setSpecs] = useState<SpecDraft[]>([]);

  const [powersOn, setPowersOn] = useState("not_tested");
  const [displayWorks, setDisplayWorks] = useState("not_tested");
  const [portsTested, setPortsTested] = useState("not_tested");
  const [cablesIncluded, setCablesIncluded] = useState("no");
  const [checklistNotes, setChecklistNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    itemId: string;
    evidenceVersion: number;
    evidenceSha256: string | null;
    anchorStatus: string | null;
    anchorError: string | null;
  } | null>(null);

  const onPickFiles = (selected: FileList | null) => {
    if (!selected) return;
    const next = Array.from(selected).slice(0, maxPhotos);
    const oversized = next.find((f) => f.size > maxBytes);
    if (oversized) {
      setAnalysis({
        kind: "error",
        message: `"${oversized.name}" is larger than the ${Math.round(maxBytes / 1_048_576)} MB limit.`,
        retryable: false,
      });
      return;
    }
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
    setAnalysis({ kind: "idle" });
  };

  const runAnalysis = async () => {
    if (files.length === 0) return;
    setAnalysis({ kind: "running" });
    const body = new FormData();
    for (const file of files) body.append("photos", file);
    body.append("ownerHint", ownerHint);

    const response = await fetch("/api/ai/analyze", { method: "POST", body });
    const data = await response.json();
    if (!data.ok) {
      setAnalysis({ kind: "error", message: data.error as string, retryable: Boolean(data.retryable) });
      return;
    }
    applyAnalysis(data.analysis as Analysis, true);
    setAnalysis({
      kind: "live",
      analysis: data.analysis as Analysis,
      model: (data.model as string) ?? aiModel,
      latencyMs: (data.latencyMs as number) ?? 0,
    });
  };

  const loadExample = async (exampleKey: string) => {
    setAnalysis({ kind: "running" });
    const response = await fetch("/api/ai/example", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ exampleKey }),
    });
    const data = await response.json();
    if (!data.ok) {
      setAnalysis({ kind: "error", message: data.error as string, retryable: false });
      return;
    }
    applyAnalysis(data.analysis as Analysis, true);
    setAnalysis({
      kind: "example",
      analysis: data.analysis as Analysis,
      label: data.exampleLabel as string,
      describes: data.exampleDescribes as string,
      disclaimer: data.disclaimer as string,
    });
  };

  /** Suggestions land in the form UNCONFIRMED. The owner must tick each one. */
  const applyAnalysis = (incoming: Analysis, overwriteEmptyOnly: boolean) => {
    if (!overwriteEmptyOnly || !title) setTitle(incoming.suggestedTitle);
    if (!overwriteEmptyOnly || !description) setDescription(incoming.draftDescription);
    if (incoming.suggestedCategory !== "unknown") setCategory(incoming.suggestedCategory);
    if (!overwriteEmptyOnly || !brand) setBrand(incoming.visibleBrand);
    if (!overwriteEmptyOnly || !model) setModel(incoming.visibleModel);
    setSpecs(
      incoming.visibleSpecifications.map((spec) => ({
        label: spec.label,
        value: spec.value,
        source: "owner_reported",
        basis: spec.evidence,
        confirmed: false,
        fromAi: true,
      })),
    );
    if (incoming.visibleDamage.length > 0 && !knownDefects) {
      setKnownDefects(
        incoming.visibleDamage
          .map((d) => `${d.observation}${d.location ? ` (${d.location})` : ""} — visible appearance only, ${d.severityWording.replace(/_/g, " ")}`)
          .join("\n"),
      );
    }
    setAnswered({});
  };

  const confirmedCount = specs.filter((s) => s.confirmed).length;
  const unconfirmedAiSpecs = specs.filter((s) => s.fromAi && !s.confirmed).length;
  const questions = analysis.kind === "live" || analysis.kind === "example" ? analysis.analysis.questionsForOwner : [];
  const unansweredQuestions = questions.filter((_, index) => !answered[index]).length;

  const massValid =
    (massKg.trim() === "" && massBasis === "unknown") || (massKg.trim() !== "" && massBasis !== "unknown");
  const valueValid =
    (replacementValue.trim() === "" && replacementValueBasis === "unknown") ||
    (replacementValue.trim() !== "" && replacementValueBasis !== "unknown");

  const canPublish =
    title.trim().length >= 5 &&
    description.trim().length >= 10 &&
    locationRegion.trim().length >= 2 &&
    quantity >= 1 &&
    massValid &&
    valueValid &&
    unansweredQuestions === 0 &&
    unconfirmedAiSpecs === 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      title: title.trim(),
      category,
      description: description.trim(),
      brand: brand.trim() || "unknown",
      model: model.trim() || "unknown",
      conditionGrade,
      quantity,
      massKg: massKg.trim() === "" ? null : Number(massKg),
      massBasis,
      replacementValue: replacementValue.trim() === "" ? null : Number(replacementValue),
      replacementValueBasis,
      locationRegion: locationRegion.trim(),
      collectionAddress: collectionAddress.trim(),
      collectionWindowStart: windowStart || null,
      collectionWindowEnd: windowEnd || null,
      knownDefects: knownDefects.trim(),
      privateNotes: privateNotes.trim(),
      specs: specs.map((s) => ({
        label: s.label,
        value: s.value,
        source: s.confirmed ? s.source : ("ai_suggested_unconfirmed" as const),
        basis: s.basis,
        confirmed: s.confirmed,
      })),
      checklist: { powersOn, displayWorks, portsTested, cablesIncluded, notes: checklistNotes.trim() },
      ownerStatement: ownerStatement.trim(),
      aiAnalysisMode:
        analysis.kind === "live" ? ("live" as const) : analysis.kind === "example" ? ("example" as const) : ("none" as const),
      aiAnalysisExampleKey: null,
      publish: true,
    };

    const body = new FormData();
    for (const file of files) body.append("photos", file);
    body.append("payload", JSON.stringify(payload));

    const response = await fetch("/api/listings", { method: "POST", body });
    const data = await response.json();
    setSubmitting(false);
    if (!response.ok || !data.ok) {
      setSubmitError(
        data.error ??
          (Array.isArray(data.details)
            ? data.details.map((d: { field: string; message: string }) => `${d.field}: ${d.message}`).join("; ")
            : "Could not publish the listing."),
      );
      return;
    }
    setResult({
      itemId: data.itemId,
      evidenceVersion: data.evidenceVersion,
      evidenceSha256: data.evidenceSha256,
      anchorStatus: data.anchorStatus,
      anchorError: data.anchorError,
    });
    router.refresh();
  };

  if (result) {
    return (
      <div className="space-y-4">
        <Callout tone="info" title={`Listing ${result.itemId} is published`}>
          <p>
            Public evidence manifest v{result.evidenceVersion} was written and its SHA-256 digest is{" "}
            <span className="lp-mono">{result.evidenceSha256?.slice(0, 24)}…</span>
          </p>
          <p className="mt-2">
            Anchor status: <strong>{result.anchorStatus ?? "not anchored"}</strong>
            {result.anchorError ? ` — ${result.anchorError}` : ""}
          </p>
        </Callout>
        <div className="flex flex-wrap gap-3">
          <a href={`/passport/${result.itemId}`} className="no-underline hover:no-underline">
            <Button>Open the item passport</Button>
          </a>
          <a href={`/marketplace/${result.itemId}`} className="no-underline hover:no-underline">
            <Button variant="secondary">View the listing</Button>
          </a>
          <Button
            variant="ghost"
            onClick={() => {
              setResult(null);
              setFiles([]);
              setPreviews([]);
              setSpecs([]);
              setTitle("");
              setDescription("");
              setAnalysis({ kind: "idle" });
            }}
          >
            List another item
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-9">
      {/* ---------------------------------------------------------- step 1 */}
      <section aria-labelledby="step-photos" className="space-y-4">
        <Step n={1} id="step-photos" title="Photograph the item" />
        <Field
          label={`Photographs (up to ${maxPhotos})`}
          hint={`JPEG, PNG or WebP, up to ${Math.round(maxBytes / 1_048_576)} MB each. On a phone this opens the camera.`}
          htmlFor="photo-input"
        >
          <input
            ref={fileInput}
            id="photo-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            capture="environment"
            onChange={(e) => onPickFiles(e.target.files)}
            className="block w-full cursor-pointer rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-forest-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
          />
        </Field>

        {previews.length > 0 ? (
          <ul className="grid grid-cols-3 gap-3">
            {previews.map((src, index) => (
              <li key={src}>
                <img
                  src={src}
                  alt={`Selected photograph ${index + 1}`}
                  className="aspect-4/3 w-full rounded-card border border-line object-cover"
                />
              </li>
            ))}
          </ul>
        ) : null}

        <Field
          label="Anything you already know about it"
          hint="Passed to the analysis as an unverified claim by you, not as fact."
          htmlFor="owner-hint"
        >
          <TextInput
            id="owner-hint"
            value={ownerHint}
            onChange={(e) => setOwnerHint(e.target.value)}
            placeholder="Came out of seminar room B, was working when removed"
            maxLength={500}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={runAnalysis}
            disabled={files.length === 0 || !aiLiveEnabled}
            loading={analysis.kind === "running"}
          >
            Analyse photographs
          </Button>
          {!aiLiveEnabled ? (
            <span className="text-sm text-ink-muted">
              Unavailable: no API key is configured in this environment.
            </span>
          ) : null}
        </div>

        {!aiLiveEnabled ? (
          <div className="rounded-card border border-dashed border-line-strong bg-paper-sunken/50 p-4">
            <p className="text-sm font-semibold text-ink">Load a labelled example analysis instead</p>
            <p className="mt-1 text-sm text-ink-soft">
              These are prerecorded samples shipped with LoopProof. Loading one does not analyse your uploads.
            </p>
            <ul className="mt-3 space-y-2">
              {examples.map((example) => (
                <li key={example.key} className="flex flex-wrap items-center gap-3">
                  <Button type="button" size="sm" variant="secondary" onClick={() => loadExample(example.key)}>
                    {example.label}
                  </Button>
                  <span className="text-xs text-ink-muted">{example.describes}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {analysis.kind === "running" ? (
          <Callout tone="neutral">
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="lp-spin inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent"
              />
              Working…
            </span>
          </Callout>
        ) : null}

        {analysis.kind === "error" ? (
          <Callout tone="warn" title="Analysis did not produce a result">
            <p>{analysis.message}</p>
            <p className="mt-2">
              Nothing was saved. Every field below is editable, so you can complete the listing by hand.
            </p>
          </Callout>
        ) : null}

        {analysis.kind === "live" ? (
          <Callout tone="info" title="Draft produced from your photographs">
            Model <code className="lp-mono">{analysis.model}</code> responded in{" "}
            {(analysis.latencyMs / 1000).toFixed(1)}s. Every suggestion below is unconfirmed until you tick it.
          </Callout>
        ) : null}

        {analysis.kind === "example" ? (
          <Callout tone="warn" title={`Prerecorded example loaded — ${analysis.label}`}>
            <p>{analysis.disclaimer}</p>
            <p className="mt-1.5 text-xs">This example describes: {analysis.describes}</p>
          </Callout>
        ) : null}
      </section>

      {/* ---------------------------------------------------------- step 2 */}
      {analysis.kind === "live" || analysis.kind === "example" ? (
        <section aria-labelledby="step-questions" className="space-y-4">
          <Step n={2} id="step-questions" title="Answer what a photograph cannot show" />

          {analysis.analysis.notAssessableFromPhoto.length > 0 ? (
            <Callout tone="neutral" title="Not assessable from a photograph">
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {analysis.analysis.notAssessableFromPhoto.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </Callout>
          ) : null}

          {questions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-ink-soft">
                Acknowledge each question once you have recorded the answer in the fields below.{" "}
                {unansweredQuestions > 0 ? (
                  <strong>{unansweredQuestions} still outstanding.</strong>
                ) : (
                  <strong>All acknowledged.</strong>
                )}
              </p>
              <ul className="space-y-2">
                {questions.map((question, index) => (
                  <li key={question.question} className="rounded-lg border border-line bg-paper-sunken/40 p-3">
                    <Checkbox
                      checked={Boolean(answered[index])}
                      onChange={(e) => setAnswered((prev) => ({ ...prev, [index]: e.target.checked }))}
                      label={question.question}
                      hint={question.whyItMatters || `Relates to: ${question.field}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {analysis.analysis.uncertainFields.length > 0 ? (
            <Callout tone="warn" title="Could not be read from the photographs">
              {analysis.analysis.uncertainFields.join(", ")}. These are recorded as unknown unless you fill them
              in.
            </Callout>
          ) : null}
        </section>
      ) : null}

      {/* ---------------------------------------------------------- step 3 */}
      <section aria-labelledby="step-confirm" className="space-y-5">
        <Step
          n={analysis.kind === "live" || analysis.kind === "example" ? 3 : 2}
          id="step-confirm"
          title="Confirm the listing"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Title" required htmlFor="field-title">
              <TextInput
                id="field-title"
                required
                minLength={5}
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Category" required htmlFor="field-category">
            <Select id="field-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Quantity" required htmlFor="field-quantity">
            <TextInput
              id="field-quantity"
              type="number"
              min={1}
              max={500}
              required
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </Field>

          <Field label="Brand" hint='Enter "unknown" if nothing is legible.' htmlFor="field-brand">
            <TextInput id="field-brand" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={80} />
          </Field>

          <Field label="Model" hint='Enter "unknown" if nothing is legible.' htmlFor="field-model">
            <TextInput id="field-model" value={model} onChange={(e) => setModel(e.target.value)} maxLength={80} />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Description" required htmlFor="field-description">
              <TextArea
                id="field-description"
                required
                minLength={10}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <RadioGroup
          legend="Condition"
          name="conditionGrade"
          value={conditionGrade}
          options={CONDITIONS}
          onChange={setConditionGrade}
          hint="Say what you know. 'Untested' is an honest answer and recipients can filter for it."
        />

        {/* specifications */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base">Specifications</h3>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                setSpecs((prev) => [
                  ...prev,
                  { label: "", value: "", source: "owner_reported", basis: "", confirmed: true, fromAi: false },
                ])
              }
            >
              Add a specification
            </Button>
          </div>
          {specs.length === 0 ? (
            <p className="text-sm text-ink-muted">
              None yet. Add anything a recipient would filter on, such as resolution or ports.
            </p>
          ) : null}
          {unconfirmedAiSpecs > 0 ? (
            <Callout tone="warn" title={`${unconfirmedAiSpecs} suggestion(s) not yet confirmed`}>
              Confirm or remove each suggested specification. Unconfirmed values stay marked{" "}
              <EvidenceBadge source="ai_suggested_unconfirmed" /> and are excluded from the public evidence
              manifest.
            </Callout>
          ) : null}
          <ul className="space-y-3">
            {specs.map((spec, index) => (
              <li key={index} className="rounded-card border border-line bg-paper-sunken/40 p-3.5">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Field label="Label" required htmlFor={`spec-label-${index}`}>
                    <TextInput
                      id={`spec-label-${index}`}
                      value={spec.label}
                      onChange={(e) => updateSpec(setSpecs, index, { label: e.target.value })}
                      placeholder="Native resolution"
                    />
                  </Field>
                  <Field label="Value" required htmlFor={`spec-value-${index}`}>
                    <TextInput
                      id={`spec-value-${index}`}
                      value={spec.value}
                      onChange={(e) => updateSpec(setSpecs, index, { value: e.target.value })}
                      placeholder="1920x1080"
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
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Basis" htmlFor={`spec-basis-${index}`} hint="Where this value came from.">
                    <TextInput
                      id={`spec-basis-${index}`}
                      value={spec.basis}
                      onChange={(e) => updateSpec(setSpecs, index, { basis: e.target.value })}
                      placeholder="Confirmed on the bench at native resolution"
                    />
                  </Field>
                  <Field label="Evidence type" htmlFor={`spec-source-${index}`}>
                    <Select
                      id={`spec-source-${index}`}
                      value={spec.source}
                      onChange={(e) =>
                        updateSpec(setSpecs, index, { source: e.target.value as SpecDraft["source"] })
                      }
                    >
                      <option value="owner_reported">Owner reported</option>
                      <option value="documented_test">Documented test</option>
                    </Select>
                  </Field>
                </div>
                <div className="mt-3">
                  <Checkbox
                    checked={spec.confirmed}
                    onChange={(e) => updateSpec(setSpecs, index, { confirmed: e.target.checked })}
                    label={
                      spec.fromAi
                        ? "I have checked this suggestion and confirm it is correct"
                        : "Confirmed and ready to publish"
                    }
                    hint="Only confirmed values are published and covered by the evidence digest."
                  />
                </div>
              </li>
            ))}
          </ul>
          {specs.length > 0 ? (
            <p className="text-sm text-ink-muted">
              {confirmedCount} of {specs.length} confirmed.
            </p>
          ) : null}
        </div>

        {/* testing checklist */}
        <div className="space-y-3">
          <h3 className="text-base">Testing checklist</h3>
          <p className="text-sm text-ink-muted">
            Record what you actually tested. This becomes <EvidenceBadge source="documented_test" /> evidence
            if anything was tested, and <EvidenceBadge source="owner_reported" /> if nothing was.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Powers on" htmlFor="check-power" required>
              <Select id="check-power" value={powersOn} onChange={(e) => setPowersOn(e.target.value)}>
                <option value="pass">Pass — it powers on</option>
                <option value="fail">Fail — it does not power on</option>
                <option value="not_tested">Not tested</option>
                <option value="not_applicable">Not applicable (not an electrical item)</option>
              </Select>
            </Field>
            <Field label="Display works" htmlFor="check-display" required>
              <Select id="check-display" value={displayWorks} onChange={(e) => setDisplayWorks(e.target.value)}>
                <option value="pass">Pass — full image across the panel</option>
                <option value="fail">Fail — no usable image</option>
                <option value="not_tested">Not tested</option>
                <option value="not_applicable">Not applicable (no display)</option>
              </Select>
            </Field>
            <Field label="Ports tested" htmlFor="check-ports" required>
              <Select id="check-ports" value={portsTested} onChange={(e) => setPortsTested(e.target.value)}>
                <option value="pass">Pass — all ports tested and working</option>
                <option value="partial">Partial — some ports tested</option>
                <option value="fail">Fail — one or more ports do not work</option>
                <option value="not_tested">Not tested</option>
                <option value="not_applicable">Not applicable</option>
              </Select>
            </Field>
            <Field label="Cables included" htmlFor="check-cables" required>
              <Select id="check-cables" value={cablesIncluded} onChange={(e) => setCablesIncluded(e.target.value)}>
                <option value="yes">Yes — all needed cables included</option>
                <option value="partial">Partial — some cables included</option>
                <option value="no">No cables included</option>
              </Select>
            </Field>
          </div>
          <Field label="Testing notes" htmlFor="check-notes">
            <TextArea
              id="check-notes"
              value={checklistNotes}
              onChange={(e) => setChecklistNotes(e.target.value)}
              maxLength={600}
              placeholder="Bench tested on 2025-03-04. Power cable and one HDMI cable included."
            />
          </Field>
        </div>

        {/* weight and value */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <Field
              label="Weight per unit (kg)"
              hint="Leave blank if you have not weighed it and do not want to guess."
              htmlFor="field-mass"
              error={massValid ? null : "Enter a weight and its basis, or leave both blank."}
            >
              <TextInput
                id="field-mass"
                type="number"
                step="0.1"
                min="0"
                value={massKg}
                onChange={(e) => {
                  setMassKg(e.target.value);
                  if (e.target.value.trim() === "") setMassBasis("unknown");
                  else if (massBasis === "unknown") setMassBasis("estimated");
                }}
              />
            </Field>
            <RadioGroup
              legend="Weight basis"
              name="massBasis"
              value={massBasis}
              onChange={(v) => setMassBasis(v)}
              options={[
                { value: "measured", label: "Measured", description: "Someone put it on a scale." },
                { value: "estimated", label: "Estimated", description: "An informed guess. Reported separately in impact figures." },
                { value: "unknown", label: "Not recorded", description: "Excluded from mass totals entirely." },
              ]}
            />
          </div>
          <div className="space-y-3">
            <Field
              label="Replacement value"
              hint="What a comparable new item would cost. Published as an estimate."
              htmlFor="field-value"
              error={valueValid ? null : "Enter a value and its basis, or leave both blank."}
            >
              <TextInput
                id="field-value"
                type="number"
                step="1"
                min="0"
                value={replacementValue}
                onChange={(e) => {
                  setReplacementValue(e.target.value);
                  if (e.target.value.trim() === "") setReplacementValueBasis("unknown");
                  else if (replacementValueBasis === "unknown") setReplacementValueBasis("owner_estimate");
                }}
              />
            </Field>
            <RadioGroup
              legend="Value basis"
              name="replacementValueBasis"
              value={replacementValueBasis}
              onChange={(v) => setReplacementValueBasis(v)}
              options={[
                { value: "owner_estimate", label: "Owner estimate", description: "Your own judgement." },
                { value: "quoted_evidence", label: "Supported by a quote", description: "You hold a quote or price record." },
                { value: "unknown", label: "Not stated", description: "No value reported." },
              ]}
            />
          </div>
        </div>

        {/* location and collection */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="General location" required hint="Shown publicly. Keep it coarse." htmlFor="field-region">
            <TextInput
              id="field-region"
              required
              value={locationRegion}
              onChange={(e) => setLocationRegion(e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field
            label="Exact collection address"
            hint="Never shown publicly. Released only to the reserved recipient."
            htmlFor="field-address"
          >
            <TextInput
              id="field-address"
              value={collectionAddress}
              onChange={(e) => setCollectionAddress(e.target.value)}
              maxLength={300}
            />
          </Field>
          <Field label="Collection window opens" htmlFor="field-window-start">
            <TextInput
              id="field-window-start"
              type="date"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
            />
          </Field>
          <Field label="Collection window closes" htmlFor="field-window-end">
            <TextInput
              id="field-window-end"
              type="date"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Known defects"
          hint="Anything wrong with it. Published and covered by the evidence digest."
          htmlFor="field-defects"
        >
          <TextArea
            id="field-defects"
            value={knownDefects}
            onChange={(e) => setKnownDefects(e.target.value)}
            maxLength={1200}
          />
        </Field>

        <Field
          label="Owner statement"
          hint="Optional context about where it came from. Published as owner-reported evidence."
          htmlFor="field-statement"
        >
          <TextArea
            id="field-statement"
            value={ownerStatement}
            onChange={(e) => setOwnerStatement(e.target.value)}
            maxLength={600}
          />
        </Field>

        <Field
          label="Private notes"
          hint="For your organization only. Never published, and not covered by the evidence digest."
          htmlFor="field-private"
        >
          <TextArea
            id="field-private"
            value={privateNotes}
            onChange={(e) => setPrivateNotes(e.target.value)}
            maxLength={1200}
          />
        </Field>
      </section>

      <div className="space-y-3 border-t border-line pt-5">
        {!canPublish ? (
          <Callout tone="warn" title="Not ready to publish">
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {title.trim().length < 5 ? <li>A title of at least 5 characters is needed.</li> : null}
              {description.trim().length < 10 ? <li>A description of at least 10 characters is needed.</li> : null}
              {locationRegion.trim().length < 2 ? <li>A general location is needed.</li> : null}
              {!massValid ? <li>Weight and its basis must agree.</li> : null}
              {!valueValid ? <li>Replacement value and its basis must agree.</li> : null}
              {unconfirmedAiSpecs > 0 ? (
                <li>{unconfirmedAiSpecs} suggested specification(s) still need confirming or removing.</li>
              ) : null}
              {unansweredQuestions > 0 ? (
                <li>{unansweredQuestions} question(s) from the analysis still need acknowledging.</li>
              ) : null}
            </ul>
          </Callout>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canPublish} loading={submitting}>
            Publish listing and anchor its evidence
          </Button>
          <span className="text-sm text-ink-muted">
            Publishing writes a public evidence manifest and anchors its digest. {" "}
            <Badge tone="outline">Private fields are excluded</Badge>
          </span>
        </div>

        {submitError ? <Callout tone="problem">{submitError}</Callout> : null}
      </div>
    </form>
  );
}

function updateSpec(
  setSpecs: React.Dispatch<React.SetStateAction<SpecDraft[]>>,
  index: number,
  patch: Partial<SpecDraft>,
) {
  setSpecs((prev) => prev.map((spec, i) => (i === index ? { ...spec, ...patch } : spec)));
}

function Step({ n, id, title }: { n: number; id: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest-600 text-sm font-bold text-white">
        {n}
      </span>
      <h2 id={id} className="text-lg">
        {title}
      </h2>
    </div>
  );
}
