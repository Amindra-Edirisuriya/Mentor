import type { ReactNode } from "react";

import { formatLocation } from "../lib/report";
import type { Evidence } from "../types";

const BADGE_STYLES: Record<string, string> = {
  used: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  verified: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  declared: "bg-amber-50 text-amber-700 ring-amber-600/20",
  inferred: "bg-amber-50 text-amber-700 ring-amber-600/20",
  unknown: "bg-slate-100 text-slate-600 ring-slate-500/20",
  frontend: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
  backend: "bg-violet-50 text-violet-700 ring-violet-600/20",
  fullstack: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  failed: "bg-rose-50 text-rose-700 ring-rose-600/20",
  succeeded: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const style = BADGE_STYLES[tone ?? String(children)] ?? "bg-slate-100 text-slate-600 ring-slate-500/20";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>
      {children}
    </span>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brand-deep to-brand-bright" aria-hidden />
          {title}
        </h2>
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
      className="inline-block max-w-full truncate rounded-md bg-slate-100 px-1.5 py-0.5 align-middle font-mono text-xs text-slate-700 ring-1 ring-inset ring-slate-200"
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
      {items.length > max && <span className="self-center text-xs text-slate-500">+{items.length - max} more</span>}
    </div>
  );
}

/** Small inline "nothing here" text inside a card. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">{children}</p>;
}

/** Larger empty state with an icon, title and hint. */
export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-mist to-white text-brand-violet ring-1 ring-inset ring-brand-violet/15">
        {icon}
      </div>
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      {children && <div className="mt-2 max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Alert({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button onClick={onDismiss} className="text-rose-500 hover:text-rose-700" aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

/** Placeholder shown while a report loads. */
export function ReportSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading report">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card space-y-2 p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card space-y-3 p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
