// Mirrors the backend JSON (app/analysis/*, app/intelligence/summary.py, app/schemas.py).

export interface Evidence {
  id: string;
  file_path: string;
  line_start: number;
  line_end: number;
  detector: string;
  detail: string;
}

export interface FileRecord {
  path: string;
  size: number;
  language: string | null;
  category: string;
  is_binary: boolean;
  line_count: number | null;
  sensitive: boolean;
}

export interface FrameworkFinding {
  name: string;
  category: string;
  status: "declared" | "used";
  evidence: Evidence[];
}

export interface EntryPoint {
  path: string;
  reason: string;
  evidence: Evidence;
}

export interface PackageUnit {
  directory: string;
  manifest_path: string;
  ecosystem: string;
  name: string | null;
  role: string;
  role_evidence: Evidence[];
  entry_points: EntryPoint[];
}

export interface LayerHint {
  kind: string;
  directory: string;
  file_count: number;
  evidence: Evidence;
}

export interface RouteFinding {
  file: string;
  method: string;
  path: string | null;
  receiver: string;
  middleware: string[];
  evidence: Evidence;
}

export interface ModelFinding {
  name: string;
  file: string;
  fields: string[];
  refs: string[];
  evidence: Evidence;
}

export interface ReportSummary {
  file_count: number;
  source_lines: number;
  languages: Record<string, number>;
  frameworks_used: string[];
  frameworks_declared_only: string[];
  route_count: number;
  model_count: number;
}

export interface AnalysisReport {
  schema_version: number;
  summary: ReportSummary;
  scan: {
    files: FileRecord[];
    ignored_dirs: Record<string, number>;
    languages: Record<string, { files: number; lines: number }>;
    categories: Record<string, number>;
  };
  frameworks: FrameworkFinding[];
  structure: {
    root_prefix: string;
    packages: PackageUnit[];
    layers: LayerHint[];
  };
  relationships: {
    files_parsed: number;
    routes: RouteFinding[];
    models: ModelFinding[];
    files_with_syntax_errors: string[];
  };
  skipped_nested_archives: string[];
}

export type ClaimLabel = "verified" | "inferred" | "unknown";

export interface Claim {
  text: string;
  label: ClaimLabel;
  evidence_ids: string[];
  downgraded_from: string | null;
  dropped_evidence_ids: string[];
}

export interface ProjectSummary {
  model: string;
  generated_at: string;
  claims: Claim[];
  rejected: { text: string; reason: string }[];
  snippet_count: number;
  redactions: number;
}

export interface Run {
  id: string;
  status: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface Project {
  id: string;
  name: string;
  original_filename: string;
  created_at: string;
  runs: Run[];
}

export interface ProjectCreated {
  project_id: string;
  run_id: string;
  status: string;
  error: string | null;
}
