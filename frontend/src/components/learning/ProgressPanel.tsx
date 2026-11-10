import { useEffect, useState } from "react";

import { getProgress } from "../../api";
import { friendlyError } from "../../lib/errors";
import type { Progress } from "../../types";
import { Empty, Section, Skeleton } from "../ui";
import { ErrorText, ProgressBar, ScorePill, StatusBadge } from "./shared";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/** Daily average score: one series, so no legend; hover/focus a bar for its values; table alternative below. */
function HistoryChart({ history }: { history: Progress["history"] }) {
  const [active, setActive] = useState<number | null>(null);
  const days = history.slice(-14);
  const shown = active !== null ? days[active] : undefined;
  return (
    <div>
      <div className="mb-2 h-5 text-xs text-slate-600" aria-live="polite">
        {shown ? (
          <>
            <span className="font-semibold text-slate-900">{shown.date}</span> · average {shown.average}% · {shown.attempts} answer(s)
          </>
        ) : (
          "Hover a bar for details"
        )}
      </div>
      <div className="relative h-40">
        {/* recessive gridlines at 25/50/75/100 */}
        {[25, 50, 75, 100].map((y) => (
          <div key={y} className="pointer-events-none absolute inset-x-0 border-t border-slate-100" style={{ bottom: `${y}%` }}>
            <span className="absolute -top-2 left-0 bg-white pr-1 text-[10px] tabular-nums text-slate-400">{y}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-slate-200 pl-6">
          {days.map((d, i) => (
            <button
              key={d.date}
              type="button"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${d.date}: average ${d.average}%, ${d.attempts} answers`}
              className="group flex h-full flex-1 items-end justify-center focus:outline-none"
            >
              <span
                className={`block w-full max-w-[28px] rounded-t-[4px] bg-brand-indigo transition-opacity ${active === null || active === i ? "opacity-100" : "opacity-40"} group-focus-visible:ring-2 group-focus-visible:ring-brand-violet/40`}
                style={{ height: `${Math.max(d.average, 2)}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between pl-6 text-[10px] text-slate-400">
        <span>{days[0]?.date}</span>
        <span>{days[days.length - 1]?.date}</span>
      </div>
      <details className="mt-3 text-xs text-slate-600">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-slate-400">
              <th className="py-1 font-medium">Date</th>
              <th className="py-1 font-medium">Answers</th>
              <th className="py-1 font-medium">Average</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date} className="border-t border-slate-100 tabular-nums">
                <td className="py-1">{d.date}</td>
                <td className="py-1">{d.attempts}</td>
                <td className="py-1">{d.average}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export function ProgressPanel({ projectId }: { projectId: string }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProgress(projectId)
      .then((p) => !cancelled && setProgress(p))
      .catch((err: unknown) => !cancelled && setError(friendlyError(err)));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!progress) return <Skeleton className="h-64 w-full" />;

  const concepts = [...progress.concepts].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Overall understanding" value={`${progress.overall}%`} hint="average over all concepts" />
        <Stat label="Mastered" value={progress.mastered} hint={`of ${progress.concepts.length} concepts`} />
        <Stat label="In progress" value={progress.learning} />
        <Stat label="Answers given" value={progress.total_attempts} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Concept mastery">
          {concepts.length === 0 ? (
            <Empty>No concepts detected.</Empty>
          ) : (
            <ul className="space-y-3">
              {concepts.map((c) => (
                <li key={c.key}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-slate-800">{c.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={c.status} />
                      <span className="w-9 text-right text-xs tabular-nums text-slate-500">{c.score}%</span>
                    </span>
                  </div>
                  <ProgressBar value={c.score} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-400">A concept counts as mastered at 75% (a running average of your graded answers).</p>
        </Section>

        <Section title="Daily average score">
          {progress.history.length === 0 ? (
            <Empty>Answer some practice questions and your daily progress will show up here.</Empty>
          ) : (
            <HistoryChart history={progress.history} />
          )}
        </Section>
      </div>

      <Section title="Recent answers">
        {progress.recent.length === 0 ? (
          <Empty>No answers yet.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {progress.recent.map((a, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-slate-800">{a.question}</p>
                  <p className="text-xs text-slate-400">
                    {a.mode === "viva" ? "Viva" : "Quiz"} · {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
                <ScorePill score={a.score} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
