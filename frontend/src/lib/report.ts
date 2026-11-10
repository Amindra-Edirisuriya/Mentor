import type { AnalysisReport, Evidence, RouteFinding } from "../types";

/** "path", "path:12" or "path:12-14" (line 0 means the whole file). */
export function formatLocation(ev: Pick<Evidence, "file_path" | "line_start" | "line_end">, prefix = ""): string {
  const path = stripPrefix(ev.file_path, prefix);
  if (ev.line_start <= 0) return path;
  if (ev.line_end <= ev.line_start) return `${path}:${ev.line_start}`;
  return `${path}:${ev.line_start}-${ev.line_end}`;
}

/** Drop the ZIP's single wrapping folder from a path for display. */
export function stripPrefix(path: string, prefix: string): string {
  return prefix && path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : path;
}

function isEvidence(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === "string" &&
    value.id.startsWith("ev-") &&
    typeof value.file_path === "string" &&
    typeof value.detector === "string" &&
    typeof value.line_start === "number"
  );
}

/** Index every evidence object anywhere in the report by id (mirrors backend collect_evidence). */
export function buildEvidenceIndex(report: unknown): Map<string, Evidence> {
  const index = new Map<string, Evidence>();
  const stack: unknown[] = [report];
  while (stack.length > 0) {
    const item = stack.pop();
    if (Array.isArray(item)) {
      stack.push(...item);
    } else if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      if (isEvidence(record)) {
        index.set(record.id as string, record as unknown as Evidence);
      } else {
        stack.push(...Object.values(record));
      }
    }
  }
  return index;
}

/** Routes grouped by file, files sorted, routes kept in source order. */
export function groupRoutesByFile(routes: RouteFinding[]): [string, RouteFinding[]][] {
  const groups = new Map<string, RouteFinding[]>();
  for (const route of routes) {
    const list = groups.get(route.file) ?? [];
    list.push(route);
    groups.set(route.file, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Languages by line count, largest first, with share of total (0-100, rounded). */
export function languageShares(languages: Record<string, number>): { name: string; lines: number; percent: number }[] {
  const total = Object.values(languages).reduce((sum, n) => sum + n, 0);
  return Object.entries(languages)
    .map(([name, lines]) => ({ name, lines, percent: total ? Math.round((lines / total) * 100) : 0 }))
    .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
}

const MANIFEST_NAMES = new Set(["package.json", "requirements.txt", "pyproject.toml"]);
// Languages whose frameworks, routes and models VIFE can detect today (Tree-sitter JS/TS + manifests).
const SUPPORTED_LANGUAGES = new Set(["JavaScript", "TypeScript", "Python"]);

/**
 * Why the analysis found nothing to teach from, or null when it found something.
 * Learning, viva, slides and the mind map can only cite what the analysis found.
 */
export function analysisGap(report: AnalysisReport): string | null {
  const { frameworks, relationships, scan } = report;
  if (frameworks.length || relationships.routes.length || relationships.models.length) return null;

  const source = scan.files.filter((f) => f.category === "source");
  if (source.length === 0) {
    return `This upload has no source code, only ${scan.files.length} other file${scan.files.length === 1 ? "" : "s"} (for example documents or designs). Upload a ZIP of the project's code.`;
  }
  const languages = [...new Set(source.map((f) => f.language).filter((l): l is string => !!l))];
  const unsupported = languages.filter((l) => !SUPPORTED_LANGUAGES.has(l) && l !== "CSS" && l !== "HTML");
  const hasManifest = scan.files.some((f) => MANIFEST_NAMES.has(f.path.split("/").pop() ?? ""));
  const parts: string[] = ["VIFE didn't find any frameworks, API routes or data models in this upload."];
  if (!hasManifest) parts.push("There's no package.json or requirements.txt, so include the whole project folder, not just src/.");
  if (unsupported.length) parts.push(`${unsupported.join(", ")} code isn't analysed yet. VIFE currently understands JavaScript, TypeScript and Python projects.`);
  return parts.join(" ");
}
