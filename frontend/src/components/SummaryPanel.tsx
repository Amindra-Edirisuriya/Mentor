import { useEffect, useState } from "react";

import { ApiError, generateSummary, getSummary } from "../api";
import type { Evidence, ProjectSummary } from "../types";
import { Badge, Empty, EvidenceChip, Section } from "./ui";

interface Props {
  projectId: string;
  evidenceIndex: Map<string, Evidence>;
  prefix: string;
}

export function SummaryPanel({ projectId, evidenceIndex, prefix }: Props) {
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setError(null);
    getSummary(projectId)
      .then((r) => !cancelled && setSummary(r.summary))
      .catch((err: unknown) => {
        if (!cancelled && !(err instanceof ApiError && err.status === 404)) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setSummary((await generateSummary(projectId)).summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate summary.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Evidence-grounded summary"
      aside={
        <button
          onClick={generate}
          disabled={busy}
          className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          {busy ? "Generating…" : summary ? "Regenerate" : "Generate"}
        </button>
      }
    >
      {error && <p className="mb-2 text-sm text-rose-700">{error}</p>}
      {!summary ? (
        <Empty>No summary yet. Every claim in a summary must cite evidence from the report.</Empty>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2">
            {summary.claims.map((claim, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-start gap-2">
                  <Badge>{claim.label}</Badge>
                  <span>{claim.text}</span>
                </div>
                <div className="ml-16 mt-1 flex flex-wrap gap-1">
                  {claim.evidence_ids.map((id) => {
                    const ev = evidenceIndex.get(id);
                    return ev ? <EvidenceChip key={id} evidence={ev} prefix={prefix} /> : null;
                  })}
                  {claim.downgraded_from && (
                    <span className="text-xs text-amber-700">downgraded from {claim.downgraded_from}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {summary.rejected.length > 0 && (
            <details className="text-sm text-slate-600">
              <summary className="cursor-pointer">{summary.rejected.length} claim(s) rejected by citation checks</summary>
              <ul className="mt-1 list-disc pl-5">
                {summary.rejected.map((r, i) => (
                  <li key={i}>
                    {r.text || "(empty)"} — <em>{r.reason}</em>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-xs text-slate-500">
            Model: {summary.model} · {summary.snippet_count} snippets · {summary.redactions} secret(s) redacted before
            sending
          </p>
        </div>
      )}
    </Section>
  );
}
