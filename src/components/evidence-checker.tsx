"use client";

import { useState } from "react";
import { Button, Field, TextArea } from "./controls";
import { Card, Badge, Callout, KeyValue } from "./ui";

type VerifyResult = {
  storedSha256: string;
  recomputedSha256: string;
  localMatch: boolean;
  anchoredSha256: string | null;
  anchorMatch: boolean | null;
  manifestVersion: string;
  anchorReadStatus: "found" | "not_registered" | "not_configured" | "unreachable";
  anchorReadError: string | null;
  interpretation: string;
};

type CheckResult = {
  candidateSha256: string;
  anchoredSha256: string | null;
  matchesAnchor: boolean | null;
  matchesAKnownVersion: number | null;
  parseWarning: string | null;
  interpretation: string;
};

/**
 * Two checks, both read-only:
 *   1. does the evidence on this page still hash to the anchored digest?
 *   2. does a document you supply hash to the anchored digest?
 * The second is how a tampered copy is demonstrated to fail.
 */
export function EvidenceChecker({ itemId }: { itemId: string }) {
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [candidate, setCandidate] = useState("");
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [loadingManifest, setLoadingManifest] = useState(false);

  const runVerify = async () => {
    setVerifying(true);
    setVerifyError(null);
    const response = await fetch(`/api/items/${itemId}/verify`);
    const data = await response.json();
    setVerifying(false);
    if (!data.ok) {
      setVerifyError(data.error ?? "Verification failed.");
      return;
    }
    setVerify(data as VerifyResult);
  };

  const loadManifest = async (tamper: boolean) => {
    setLoadingManifest(true);
    const response = await fetch(`/api/items/${itemId}/manifest`);
    const data = await response.json();
    setLoadingManifest(false);
    if (!data.canonicalJson) return;
    let text = JSON.stringify(JSON.parse(data.canonicalJson as string), null, 2);
    if (tamper) {
      // Edit one field of a COPY. The real record is untouched.
      const parsed = JSON.parse(data.canonicalJson as string) as Record<string, unknown>;
      parsed.conditionGrade = "working_good";
      parsed.knownDefects = "none reported";
      text = JSON.stringify(parsed, null, 2);
    }
    setCandidate(text);
    setCheck(null);
  };

  const runCheck = async () => {
    setChecking(true);
    const response = await fetch(`/api/items/${itemId}/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ candidateJson: candidate, canonicalizeFirst: true }),
    });
    const data = await response.json();
    setChecking(false);
    if (data.ok) setCheck(data as CheckResult);
  };

  return (
    <Card className="p-5">
      <h2 className="text-lg">Check this evidence</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Both checks are read-only. Nothing on this page changes when you run them.
      </p>

      {/* --- check 1 ------------------------------------------------------- */}
      <div className="mt-5 space-y-3 border-b border-line pb-6">
        <h3 className="text-base">1. Does the evidence shown here still match its anchor?</h3>
        <Button onClick={runVerify} loading={verifying}>
          Check the evidence on this page
        </Button>

        {verifyError ? <Callout tone="problem">{verifyError}</Callout> : null}

        {verify ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {verify.localMatch ? (
                <Badge tone="forest" glyph="✓">
                  Page matches the stored manifest
                </Badge>
              ) : (
                <Badge tone="clay" glyph="✕">
                  Page does NOT match the stored manifest
                </Badge>
              )}
              {verify.anchorMatch === null ? (
                verify.anchorReadStatus === "unreachable" ? (
                  <Badge tone="amber" glyph="!">
                    Anchor not checked — chain unreachable
                  </Badge>
                ) : (
                  <Badge tone="outline" glyph="○">
                    Nothing anchored on chain
                  </Badge>
                )
              ) : verify.anchorMatch ? (
                <Badge tone="forest" glyph="⛓">
                  Matches the on-chain anchor
                </Badge>
              ) : (
                <Badge tone="clay" glyph="✕">
                  Does NOT match the on-chain anchor
                </Badge>
              )}
            </div>
            <Callout
              tone={
                !verify.localMatch || verify.anchorMatch === false
                  ? "problem"
                  : verify.anchorReadStatus === "unreachable"
                    ? "warn"
                    : "info"
              }
            >
              {verify.interpretation}
            </Callout>
            <dl className="divide-y divide-line">
              <KeyValue label="Recomputed from this page">
                <span className="lp-mono">{verify.recomputedSha256}</span>
              </KeyValue>
              <KeyValue label="Stored in LoopProof">
                <span className="lp-mono">{verify.storedSha256 || "—"}</span>
              </KeyValue>
              <KeyValue label="Anchored on chain">
                <span className="lp-mono">
                  {verify.anchoredSha256 ??
                    (verify.anchorReadStatus === "unreachable"
                      ? "could not be read — the chain is unreachable"
                      : "nothing anchored")}
                </span>
              </KeyValue>
            </dl>
          </div>
        ) : null}
      </div>

      {/* --- check 2 ------------------------------------------------------- */}
      <div className="mt-6 space-y-3">
        <h3 className="text-base">2. Check a document someone handed you</h3>
        <p className="text-sm text-ink-soft">
          Paste a manifest document and LoopProof will hash it and compare the result with what is anchored. Use
          the second button to load an <strong>altered copy</strong> and watch the check fail — the item&rsquo;s
          real evidence is not touched.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => loadManifest(false)} loading={loadingManifest}>
            Load the genuine manifest
          </Button>
          <Button variant="secondary" size="sm" onClick={() => loadManifest(true)} loading={loadingManifest}>
            Load an altered copy
          </Button>
          {candidate ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCandidate("");
                setCheck(null);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>

        <Field label="Manifest document to check" htmlFor="candidate-json">
          <TextArea
            id="candidate-json"
            value={candidate}
            onChange={(e) => {
              setCandidate(e.target.value);
              setCheck(null);
            }}
            rows={10}
            className="lp-mono min-h-48"
            placeholder="Paste a manifest JSON document, or use a button above."
          />
        </Field>

        <Button onClick={runCheck} disabled={candidate.trim().length < 2} loading={checking}>
          Hash it and compare with the anchor
        </Button>

        {check ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {check.matchesAnchor === null ? (
                <Badge tone="outline" glyph="○">
                  Nothing anchored to compare against
                </Badge>
              ) : check.matchesAnchor ? (
                <Badge tone="forest" glyph="✓">
                  Hash matches the anchor
                </Badge>
              ) : (
                <Badge tone="clay" glyph="✕">
                  Hash mismatch
                </Badge>
              )}
              {check.matchesAKnownVersion != null ? (
                <Badge tone="mint" glyph="v">
                  Matches stored manifest v{check.matchesAKnownVersion}
                </Badge>
              ) : null}
            </div>
            <Callout tone={check.matchesAnchor ? "info" : "problem"}>{check.interpretation}</Callout>
            {check.parseWarning ? <Callout tone="warn">{check.parseWarning}</Callout> : null}
            <dl className="divide-y divide-line">
              <KeyValue label="Digest of your document">
                <span className="lp-mono">{check.candidateSha256}</span>
              </KeyValue>
              <KeyValue label="Digest anchored on chain">
                <span className="lp-mono">{check.anchoredSha256 ?? "nothing anchored"}</span>
              </KeyValue>
            </dl>
          </div>
        ) : null}
      </div>

      <Callout tone="neutral" title="What this check does and does not establish">
        A match shows that the public evidence is byte-identical to what was anchored at the time, so it has not
        been quietly edited since. It does not show that the evidence was true when it was written, that the item
        works, or that the physical handoff happened as described.
      </Callout>
    </Card>
  );
}
