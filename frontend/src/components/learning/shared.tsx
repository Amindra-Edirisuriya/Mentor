import type { Claim, ConceptStatus, Evidence } from "../../types";
import { STATUS_LABEL, scoreTone } from "../../lib/learning";
import { Badge, EvidenceChip } from "../ui";

/** Evidence lookup shared by every learning panel: ids → evidence, plus the ZIP's root folder. */
export interface EvidenceCtx {
  index: Map<string, Evidence>;
  prefix: string;
}

const STATUS_STYLE: Record<ConceptStatus, string> = {
  not_started: "bg-slate-100 text-slate-600 ring-slate-500/20",
  learning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  mastered: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

export function StatusBadge({ status }: { status: ConceptStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ScorePill({ score }: { score: number }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${scoreTone(score)}`}>
      {score}%
    </span>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-slate-100 ${className}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gradient-to-r from-brand-violet to-brand-cyan transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EvidenceChips({ ids, ctx }: { ids: string[]; ctx: EvidenceCtx }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => {
        const ev = ctx.index.get(id);
        return ev ? <EvidenceChip key={id} evidence={ev} prefix={ctx.prefix} /> : null;
      })}
    </div>
  );
}

export function ClaimList({ claims, ctx, numbered = false }: { claims: Claim[]; ctx: EvidenceCtx; numbered?: boolean }) {
  return (
    <ol className="space-y-2">
      {claims.map((claim, i) => (
        <li key={i} className="rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex items-start gap-2">
            {numbered && (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-indigo/10 text-xs font-semibold text-brand-indigo">
                {i + 1}
              </span>
            )}
            <span className="flex-1 text-slate-800">{claim.text}</span>
            <Badge>{claim.label}</Badge>
          </div>
          <div className={`mt-2 ${numbered ? "pl-7" : ""}`}>
            <EvidenceChips ids={claim.evidence_ids} ctx={ctx} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ErrorText({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {children}
    </p>
  );
}
