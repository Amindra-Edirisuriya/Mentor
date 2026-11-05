import { useCallback, useEffect, useState } from "react";

import { getReport, listProjects } from "./api";
import { ReportView } from "./components/ReportView";
import { Alert, Badge, EmptyState, ReportSkeleton, Skeleton } from "./components/ui";
import { UploadForm } from "./components/UploadForm";
import { friendlyError } from "./lib/errors";
import type { AnalysisReport, Project } from "./types";

function Header() {
  return (
    <header className="relative overflow-hidden bg-brand-night text-white">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.45),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(34,211,238,0.25),transparent_50%)]"
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
        <img
          src="/logo.png"
          alt="VIFE logo"
          className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-lg shadow-brand-violet/30 ring-1 ring-white/10 sm:h-14 sm:w-14"
        />
        <div className="min-w-0">
          <h1 className="bg-gradient-to-r from-white via-violet-200 to-cyan-200 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent sm:text-3xl">
            VIFE
          </h1>
          <p className="truncate text-sm font-medium text-cyan-200/90">Vibe Intelligence for Engineering</p>
        </div>
        <p className="ml-auto hidden max-w-sm text-right text-xs leading-relaxed text-slate-300 lg:block">
          An AI-powered engineering project intelligence and adaptive learning platform.
        </p>
      </div>
    </header>
  );
}

function ProjectList({
  projects,
  loading,
  selected,
  onSelect,
}: {
  projects: Project[];
  loading: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (projects.length === 0) {
    return <p className="py-3 text-center text-sm text-slate-500">No projects yet — your uploads will appear here.</p>;
  }
  return (
    <ul className="space-y-1">
      {projects.map((p) => {
        const last = p.runs[p.runs.length - 1];
        const active = selected === p.id;
        return (
          <li key={p.id}>
            <button
              onClick={() => onSelect(p.id)}
              aria-current={active ? "true" : undefined}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                active
                  ? "bg-gradient-to-r from-brand-violet/10 to-brand-cyan/10 font-medium text-brand-indigo ring-1 ring-inset ring-brand-violet/30"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span className="truncate">{p.name}</span>
              {last && <Badge>{last.status}</Badge>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (err) {
      setError(friendlyError(err, "Couldn't load your projects."));
    } finally {
      setProjectsLoading(false);
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
      .catch((err: unknown) => !cancelled && setError(friendlyError(err, "Couldn't load this report.")));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const selectedName = projects.find((p) => p.id === selected)?.name;

  return (
    <div className="min-h-screen">
      <Header />

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row md:items-start">
        <aside className="w-full shrink-0 space-y-4 md:sticky md:top-6 md:w-80">
          <div className="card p-4 sm:p-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">Analyse a project</h2>
            <p className="mb-4 text-xs text-slate-500">Upload a ZIP of your code to map what it really uses.</p>
            <UploadForm
              onUploaded={(created) => {
                void refresh();
                setSelected(created.project_id);
              }}
            />
          </div>

          <div className="card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Your projects</h2>
              {projects.length > 0 && <span className="text-xs text-slate-400">{projects.length}</span>}
            </div>
            <ProjectList projects={projects} loading={projectsLoading} selected={selected} onSelect={setSelected} />
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4">
          {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
          {selected && selectedName && (
            <h2 className="truncate text-xl font-bold tracking-tight text-slate-900">{selectedName}</h2>
          )}
          {!selected ? (
            <EmptyState
              title="Understand what you build"
              icon={
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8 9-3 3 3 3m8-6 3 3-3 3m-5 3 2-12" />
                </svg>
              }
            >
              Upload a ZIP of your project, or pick one from your projects. VIFE maps the frameworks, routes and models
              it finds to the exact files and lines — every finding comes with evidence.
            </EmptyState>
          ) : report ? (
            <ReportView projectId={selected} report={report} />
          ) : (
            !error && <ReportSkeleton />
          )}
        </main>
      </div>

      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-2 text-center text-xs text-slate-400 sm:px-6">
        VIFE · Vibe Intelligence for Engineering
      </footer>
    </div>
  );
}
