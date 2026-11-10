import { useEffect, useState } from "react";

import { ApiError, generateExplanation, getExplanation, getPathway } from "../../api";
import { friendlyError } from "../../lib/errors";
import type { Explanation, Pathway, PathwayConcept } from "../../types";
import { Empty, EvidenceList, Section, Skeleton, Spinner } from "../ui";
import { ClaimList, ErrorText, ProgressBar, ScorePill, StatusBadge, type EvidenceCtx } from "./shared";

const LEVELS: Record<number, string> = { 1: "Fundamentals", 2: "Core", 3: "Advanced" };

function ConceptDetail({
  projectId,
  concept,
  ctx,
  onPractice,
}: {
  projectId: string;
  concept: PathwayConcept;
  ctx: EvidenceCtx;
  onPractice: (key: string) => void;
}) {
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setExplanation(null);
    setError(null);
    setLoading(true);
    getExplanation(projectId, concept.key)
      .then((e) => !cancelled && setExplanation(e))
      .catch((err: unknown) => !cancelled && !(err instanceof ApiError && err.status === 404) && setError(friendlyError(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId, concept.key]);

  async function explain() {
    setBusy(true);
    setError(null);
    try {
      setExplanation(await generateExplanation(projectId, concept.key));
    } catch (err) {
      setError(friendlyError(err, "Couldn't generate the explanation."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold text-slate-900">{concept.name}</h3>
          <StatusBadge status={concept.status} />
          {concept.score !== null && <ScorePill score={concept.score} />}
        </div>
        {concept.description && <p className="mt-1 text-sm text-slate-600">{concept.description}</p>}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Where it is in your code</h4>
        <EvidenceList items={concept.evidence} prefix={ctx.prefix} max={6} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">How it works in your project</h4>
          <button onClick={explain} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">
            {busy ? (
              <>
                <Spinner className="h-3.5 w-3.5" /> Explaining…
              </>
            ) : explanation ? (
              "Regenerate"
            ) : (
              "Explain my code"
            )}
          </button>
        </div>
        <ErrorText>{error}</ErrorText>
        {loading || busy ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-5/6" />
          </div>
        ) : explanation ? (
          <div className="space-y-4">
            {explanation.claims.length > 0 ? (
              <ClaimList claims={explanation.claims} ctx={ctx} numbered />
            ) : (
              <Empty>The AI's explanation didn't pass the citation checks. Try regenerating.</Empty>
            )}
            {explanation.key_terms.length > 0 && (
              <dl className="grid gap-2 sm:grid-cols-2">
                {explanation.key_terms.map((t) => (
                  <div key={t.term} className="rounded-lg border border-slate-200 p-3">
                    <dt className="text-sm font-semibold text-slate-800">{t.term}</dt>
                    <dd className="mt-0.5 text-xs text-slate-600">{t.meaning}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="text-xs text-slate-400">
              Model: {explanation.model}
              {explanation.rejected.length > 0 && ` · ${explanation.rejected.length} uncited statement(s) removed`}
            </p>
          </div>
        ) : (
          <Empty>Get a step-by-step walkthrough of how {concept.name.toLowerCase()} works in your files, with citations.</Empty>
        )}
      </div>

      {concept.resources.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Learn more (free)</h4>
          <ul className="space-y-1.5">
            {concept.resources.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2 text-sm text-brand-indigo hover:underline">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{r.kind}</span>
                  {r.title}
                  <span aria-hidden className="text-slate-400 group-hover:text-brand-indigo">↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button onClick={() => onPractice(concept.key)} className="w-full rounded-lg border border-brand-indigo/30 px-4 py-2 text-sm font-semibold text-brand-indigo transition hover:bg-brand-indigo/5">
        Practise {concept.name} →
      </button>
    </div>
  );
}

export function LearnPanel({ projectId, ctx, onPractice }: { projectId: string; ctx: EvidenceCtx; onPractice: (key: string) => void }) {
  const [pathway, setPathway] = useState<Pathway | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPathway(null);
    getPathway(projectId)
      .then((p) => {
        if (cancelled) return;
        setPathway(p);
        setSelected(p.next_concept ?? p.concepts[0]?.key ?? null);
      })
      .catch((err: unknown) => !cancelled && setError(friendlyError(err)));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!pathway) return <Skeleton className="h-64 w-full" />;
  if (pathway.concepts.length === 0) return <Empty>No engineering concepts were detected in this project yet.</Empty>;

  const current = pathway.concepts.find((c) => c.key === selected) ?? pathway.concepts[0];
  const levels = [...new Set(pathway.concepts.map((c) => c.level))];

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <Section title="Your learning pathway">
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>
              {pathway.mastered} of {pathway.total} mastered
            </span>
            <span>{Math.round((100 * pathway.mastered) / pathway.total)}%</span>
          </div>
          <ProgressBar value={(100 * pathway.mastered) / pathway.total} />
        </div>
        <div className="space-y-4">
          {levels.map((level) => (
            <div key={level}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{LEVELS[level] ?? `Level ${level}`}</p>
              <ul className="space-y-1">
                {pathway.concepts
                  .filter((c) => c.level === level)
                  .map((c) => (
                    <li key={c.key}>
                      <button
                        onClick={() => setSelected(c.key)}
                        aria-current={current?.key === c.key ? "true" : undefined}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                          current?.key === c.key ? "bg-brand-indigo/10 font-medium text-brand-indigo" : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              c.status === "mastered" ? "bg-emerald-500" : c.status === "learning" ? "bg-amber-500" : "bg-slate-300"
                            }`}
                          />
                          <span className="truncate">{c.name}</span>
                        </span>
                        {c.key === pathway.next_concept && (
                          <span className="shrink-0 rounded-full bg-brand-violet/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-violet">NEXT</span>
                        )}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
      <section className="card p-4 sm:p-6">
        {current && <ConceptDetail projectId={projectId} concept={current} ctx={ctx} onPractice={onPractice} />}
      </section>
    </div>
  );
}
