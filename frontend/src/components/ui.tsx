import type { ReactNode } from "react";

import { formatLocation } from "../lib/report";
import type { Evidence } from "../types";

const BADGE_STYLES: Record<string, string> = {
  used: "bg-emerald-100 text-emerald-800",
  verified: "bg-emerald-100 text-emerald-800",
  declared: "bg-amber-100 text-amber-800",
  inferred: "bg-amber-100 text-amber-800",
  unknown: "bg-slate-200 text-slate-700",
  frontend: "bg-sky-100 text-sky-800",
  backend: "bg-violet-100 text-violet-800",
  fullstack: "bg-indigo-100 text-indigo-800",
  failed: "bg-rose-100 text-rose-800",
  succeeded: "bg-emerald-100 text-emerald-800",
};

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const style = BADGE_STYLES[tone ?? String(children)] ?? "bg-slate-100 text-slate-700";
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${style}`}>{children}</span>;
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function EvidenceChip({ evidence, prefix }: { evidence: Evidence; prefix: string }) {
  return (
    <code
      title={`${evidence.id} · ${evidence.detector}${evidence.detail ? ` · ${evidence.detail}` : ""}`}
      className="inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700"
    >
      {formatLocation(evidence, prefix)}
    </code>
  );
}

export function EvidenceList({ items, prefix, max = 4 }: { items: Evidence[]; prefix: string; max?: number }) {
  const shown = items.slice(0, max);
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((e) => (
        <EvidenceChip key={e.id} evidence={e} prefix={prefix} />
      ))}
      {items.length > max && <span className="text-xs text-slate-500">+{items.length - max} more</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}
