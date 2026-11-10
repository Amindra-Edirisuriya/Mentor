import { useCallback, useEffect, useMemo, useState } from "react";

import { getReport, listProjects, reanalyseProject } from "../api";
import { AppFooter, AppHeader } from "../components/AppHeader";
import { LearnPanel } from "../components/learning/LearnPanel";
import { MindMapPanel } from "../components/learning/MindMapPanel";
import { PracticePanel } from "../components/learning/PracticePanel";
import { PresentationPanel } from "../components/learning/PresentationPanel";
import { ProgressPanel } from "../components/learning/ProgressPanel";
import { ReportView } from "../components/ReportView";
import { Alert, Badge, EmptyState, ReportSkeleton, Skeleton, Spinner } from "../components/ui";
import { UploadForm } from "../components/UploadForm";
import { friendlyError } from "../lib/errors";
import { analysisGap, buildEvidenceIndex } from "../lib/report";
import type { AnalysisReport, Project } from "../types";

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

const TABS = [
  { id: "report", label: "Report" },
  { id: "mindmap", label: "Mind map" },
  { id: "learn", label: "Learn" },
  { id: "practice", label: "Practice & viva" },
  { id: "progress", label: "Progress" },
  { id: "presentation", label: "Presentation" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Tabs({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div role="tablist" aria-label="Project views" className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
            active === t.id ? "border-brand-indigo text-brand-indigo" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const [tab, setTab] = useState<TabId>("report");
  const [practiceConcept, setPracticeConcept] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [reanalysing, setReanalysing] = useState(false);

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
    setPracticeConcept(null); // concepts differ between projects
    setError(null);
    getReport(selected)
      .then((r) => !cancelled && setReport(r.report))
      .catch((err: unknown) => !cancelled && setError(friendlyError(err, "Couldn't load this report.")));
    return () => {
      cancelled = true;
    };
  }, [selected, reloadKey]);

  const reanalyse = async () => {
    if (!selected) return;
    setReanalysing(true);
    setError(null);
    try {
      const run = await reanalyseProject(selected);
      if (run.status !== "succeeded") setError(run.error ?? "Re-analysis failed.");
      await refresh();
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(friendlyError(err, "Couldn't re-analyse this project."));
    } finally {
      setReanalysing(false);
    }
  };
  const gap = report ? analysisGap(report) : null;

  const selectedName = projects.find((p) => p.id === selected)?.name;
  const evidenceCtx = useMemo(
    () => ({ index: report ? buildEvidenceIndex(report) : new Map(), prefix: report?.structure.root_prefix ?? "" }),
    [report],
  );

  return (
    <div className="min-h-screen">
      <AppHeader />

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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="min-w-0 truncate text-xl font-bold tracking-tight text-slate-900">{selectedName}</h2>
              <button
                onClick={() => void reanalyse()}
                disabled={reanalysing}
                title="Run the analysis again on your stored upload"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                {reanalysing && <Spinner className="h-3 w-3" />}
                {reanalysing ? "Re-analysing…" : "Re-analyse"}
              </button>
            </div>
          )}
          {gap && (
            <div role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-600/20">
              <p className="font-semibold">Nothing to learn from yet</p>
              <p className="mt-1">
                {gap} Learning, viva questions, slides and the mind map are built only from what the analysis finds, so they'll be
                empty until then.
              </p>
            </div>
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
            <>
              <Tabs active={tab} onChange={setTab} />
              <div role="tabpanel">
                {tab === "report" && <ReportView projectId={selected} report={report} />}
                {tab === "mindmap" && (
                  <MindMapPanel projectId={selected} projectName={selectedName ?? "Project"} report={report} ctx={evidenceCtx} />
                )}
                {tab === "learn" && (
                  <LearnPanel
                    projectId={selected}
                    ctx={evidenceCtx}
                    onPractice={(key) => {
                      setPracticeConcept(key);
                      setTab("practice");
                    }}
                  />
                )}
                {tab === "practice" && <PracticePanel projectId={selected} ctx={evidenceCtx} initialConcept={practiceConcept} />}
                {tab === "progress" && <ProgressPanel projectId={selected} />}
                {tab === "presentation" && <PresentationPanel projectId={selected} ctx={evidenceCtx} />}
              </div>
            </>
          ) : (
            !error && <ReportSkeleton />
          )}
        </main>
      </div>

      <AppFooter />
    </div>
  );
}
