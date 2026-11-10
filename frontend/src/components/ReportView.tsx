import { useMemo } from "react";

import { buildEvidenceIndex, groupRoutesByFile, languageShares, stripPrefix } from "../lib/report";
import type { AnalysisReport } from "../types";
import { SummaryPanel } from "./SummaryPanel";
import { Badge, Empty, EvidenceChip, EvidenceList, Section } from "./ui";

export function ReportView({ projectId, report }: { projectId: string; report: AnalysisReport }) {
  const prefix = report.structure.root_prefix;
  const evidenceIndex = useMemo(() => buildEvidenceIndex(report), [report]);
  const routeGroups = useMemo(() => groupRoutesByFile(report.relationships.routes), [report]);
  const languages = languageShares(report.summary.languages);
  const sensitive = report.scan.files.filter((f) => f.sensitive);
  const s = report.summary;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Files", s.file_count],
          ["Source lines", s.source_lines],
          ["Routes", s.route_count],
          ["Models", s.model_count],
        ].map(([label, value]) => (
          <div key={label} className="card relative overflow-hidden p-4">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-deep via-brand-violet to-brand-bright" aria-hidden />
            <div className="text-xs font-medium text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {Number(value).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <SummaryPanel projectId={projectId} evidenceIndex={evidenceIndex} prefix={prefix} />

      <Section title="Technologies">
        {report.frameworks.length === 0 ? (
          <Empty>No known frameworks detected.</Empty>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[32rem] text-sm">
            <tbody>
              {report.frameworks.map((f) => (
                <tr key={f.name} className="border-t border-slate-100 align-top">
                  <td className="py-2 pr-3 font-medium text-slate-800">{f.name}</td>
                  <td className="py-2 pr-3 text-slate-500">{f.category}</td>
                  <td className="py-2 pr-3">
                    <Badge>{f.status}</Badge>
                  </td>
                  <td className="py-2">
                    <EvidenceList items={f.evidence} prefix={prefix} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          <b>used</b> = imported in source code · <b>declared</b> = only listed in a manifest or config file
        </p>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Packages & entry points">
          {report.structure.packages.length === 0 ? (
            <Empty>No manifests found.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {report.structure.packages.map((p) => (
                <li key={p.manifest_path}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{stripPrefix(p.directory, prefix) || "(root)"}</span>
                    <Badge>{p.role}</Badge>
                    {p.name && <span className="text-slate-500">{p.name}</span>}
                  </div>
                  {p.entry_points.map((e) => (
                    <div key={e.path} className="ml-4 mt-1 text-xs text-slate-600">
                      entry: <span className="font-mono">{stripPrefix(e.path, prefix)}</span> ({e.reason}){" "}
                      <EvidenceChip evidence={e.evidence} prefix={prefix} />
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Languages">
          {languages.length === 0 ? (
            <Empty>No source files.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {languages.map((l) => (
                <li key={l.name} className="flex items-center gap-2">
                  <span className="w-20 truncate sm:w-24">{l.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-gradient-to-r from-brand-deep to-brand-bright" style={{ width: `${l.percent}%` }} />
                  </div>
                  <span className="w-20 text-right text-xs text-slate-500">{l.lines} lines</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Express routes">
        {routeGroups.length === 0 ? (
          <Empty>No Express routes detected.</Empty>
        ) : (
          <div className="space-y-3">
            {routeGroups.map(([file, routes]) => (
              <div key={file}>
                <div className="mb-1 truncate font-mono text-xs text-slate-500">{stripPrefix(file, prefix)}</div>
                <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[28rem] text-sm">
                  <tbody>
                    {routes.map((r) => (
                      <tr key={r.evidence.id} className="border-t border-slate-100">
                        <td className="w-20 py-1.5">
                          <span className="rounded bg-brand-navy px-1.5 py-0.5 font-mono text-[11px] font-semibold text-cyan-200">
                            {r.method}
                          </span>
                        </td>
                        <td className="py-1.5 font-mono">{r.path ?? "—"}</td>
                        <td className="py-1.5 text-xs text-slate-500">{r.middleware.join(", ")}</td>
                        <td className="py-1.5 text-right">
                          <EvidenceChip evidence={r.evidence} prefix={prefix} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Data models (Mongoose)">
        {report.relationships.models.length === 0 ? (
          <Empty>No Mongoose models detected.</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {report.relationships.models.map((m) => (
              <li key={m.evidence.id}>
                <span className="font-medium text-slate-800">{m.name}</span>{" "}
                <EvidenceChip evidence={m.evidence} prefix={prefix} />
                <div className="mt-1 text-xs text-slate-600">
                  fields: {m.fields.join(", ") || "—"}
                  {m.refs.length > 0 && <> · references: {m.refs.join(", ")}</>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {(sensitive.length > 0 ||
        report.skipped_nested_archives.length > 0 ||
        report.relationships.files_with_syntax_errors.length > 0) && (
        <Section title="Notes">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {sensitive.length > 0 && (
              <li>
                {sensitive.length} sensitive file(s) (e.g. <code>.env</code>) were found. They are never sent to the LLM:{" "}
                {sensitive.map((f) => stripPrefix(f.path, prefix)).join(", ")}
              </li>
            )}
            {report.skipped_nested_archives.length > 0 && (
              <li>Nested archives were skipped: {report.skipped_nested_archives.join(", ")}</li>
            )}
            {report.relationships.files_with_syntax_errors.length > 0 && (
              <li>
                Only partly parsed (the rest of each file was still analysed; this can be a parser limitation, e.g. a
                bare <code>&amp;</code> in JSX text, not necessarily a bug in your code):{" "}
                {report.relationships.files_with_syntax_errors.map((p) => stripPrefix(p, prefix)).join(", ")}
              </li>
            )}
          </ul>
        </Section>
      )}
    </div>
  );
}
