import { useCallback, useEffect, useState } from "react";

import { getReport, listProjects } from "./api";
import { ReportView } from "./components/ReportView";
import { Badge, Empty } from "./components/ui";
import { UploadForm } from "./components/UploadForm";
import type { AnalysisReport, Project } from "./types";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (err) {
      setError(err instanceof Error ? `Backend unavailable: ${err.message}` : "Backend unavailable");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setReport(null);
    setError(null);
    getReport(selected)
      .then((r) => !cancelled && setReport(r.report))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 md:flex-row">
      <aside className="w-full shrink-0 space-y-4 md:w-72">
        <div>
          <h1 className="text-xl font-bold">EngiMentor</h1>
          <p className="text-sm text-slate-500">Understand the project you built.</p>
        </div>
        <UploadForm
          onUploaded={(created) => {
            void refresh();
            setSelected(created.project_id);
          }}
        />
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase text-slate-500">Projects</h2>
          {projects.length === 0 ? (
            <Empty>No projects yet.</Empty>
          ) : (
            <ul className="space-y-1">
              {projects.map((p) => {
                const last = p.runs[p.runs.length - 1];
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelected(p.id)}
                      className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm ${
                        selected === p.id ? "bg-slate-900 text-white" : "hover:bg-slate-200"
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      {last && <Badge>{last.status}</Badge>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {error && <p className="mb-3 rounded bg-rose-50 p-2 text-sm text-rose-800">{error}</p>}
        {!selected ? (
          <Empty>Upload a ZIP of your project, or pick one on the left.</Empty>
        ) : report ? (
          <ReportView projectId={selected} report={report} />
        ) : (
          !error && <Empty>Loading report…</Empty>
        )}
      </main>
    </div>
  );
}
