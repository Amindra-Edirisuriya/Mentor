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
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="text-xs uppercase text-slate-500">{label}</div>
            <div className="text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <SummaryPanel projectId={projectId} evidenceIndex={evidenceIndex} prefix={prefix} />

      <Section title="Technologies">
        {report.frameworks.length === 0 ? (
          <Empty>No known frameworks detected.</Empty>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {report.frameworks.map((f) => (
                <tr key={f.name} className="border-t border-slate-100 align-top">
                  <td className="py-1.5 pr-2 font-medium">{f.name}</td>
                  <td className="py-1.5 pr-2 text-slate-500">{f.category}</td>
                  <td className="py-1.5 pr-2">
                    <Badge>{f.status}</Badge>
                  </td>
                  <td className="py-1.5">
                    <EvidenceList items={f.evidence} prefix={prefix} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-slate-500">
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
                  <div className="flex items-center gap-2">
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
            <ul className="space-y-1 text-sm">
              {languages.map((l) => (
                <li key={l.name} className="flex items-center gap-2">
                  <span className="w-24">{l.name}</span>
                  <div className="h-2 flex-1 rounded bg-slate-100">
                    <div className="h-2 rounded bg-slate-700" style={{ width: `${l.percent}%` }} />
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
                <div className="mb-1 font-mono text-xs text-slate-500">{stripPrefix(file, prefix)}</div>
                <table className="w-full text-sm">
                  <tbody>
                    {routes.map((r) => (
                      <tr key={r.evidence.id} className="border-t border-slate-100">
                        <td className="w-16 py-1 font-mono text-xs font-semibold">{r.method}</td>
                        <td className="py-1 font-mono">{r.path ?? "—"}</td>
                        <td className="py-1 text-xs text-slate-500">{r.middleware.join(", ")}</td>
                        <td className="py-1 text-right">
                          <EvidenceChip evidence={r.evidence} prefix={prefix} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                <span className="font-medium">{m.name}</span>{" "}
                <EvidenceChip evidence={m.evidence} prefix={prefix} />
                <div className="text-xs text-slate-600">
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
              <li>Files with syntax errors: {report.relationships.files_with_syntax_errors.join(", ")}</li>
            )}
          </ul>
        </Section>
      )}
    </div>
  );
}
