// Mind map of a project, built only from the deterministic analysis report and detected concepts.
// No AI is involved: every node is something the analysis found and carries its evidence ids.

import type { AnalysisReport, ConceptStatus, PathwayConcept } from "../types";

export type MindTone = "used" | "declared" | ConceptStatus;

export interface MindNode {
  id: string;
  label: string;
  detail: string;
  evidenceIds: string[];
  tone?: MindTone;
  color: string; // the branch colour, inherited by its leaves
  children: MindNode[];
}

// Framework categories (app/analysis/frameworks.py) grouped into a few readable branches.
const STACK_GROUPS: { label: string; color: string; categories: string[] }[] = [
  { label: "Frontend", color: "#6366f1", categories: ["frontend", "styling", "build", "http-client"] },
  { label: "Backend", color: "#0891b2", categories: ["backend", "realtime", "uploads", "config"] },
  { label: "Data", color: "#059669", categories: ["database", "orm"] },
  { label: "Security", color: "#e11d48", categories: ["auth"] },
  { label: "Testing & infra", color: "#64748b", categories: ["testing", "infrastructure"] },
];
const CONCEPT_COLOR = "#7c3aed";
const ROUTE_COLOR = "#d97706";
const MODEL_COLOR = "#0d9488";
const MAX_IDS = 6;

const STATUS_TEXT: Record<ConceptStatus, string> = {
  not_started: "not started",
  learning: "learning",
  mastered: "mastered",
};

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

function branch(id: string, label: string, color: string, children: MindNode[]): MindNode {
  const ids = [...new Set(children.flatMap((c) => c.evidenceIds))].slice(0, MAX_IDS);
  const detail = `${children.length} item${children.length === 1 ? "" : "s"}`;
  return { id, label, detail, evidenceIds: ids, color, children };
}

export function buildMindMap(projectName: string, report: AnalysisReport, concepts: PathwayConcept[]): MindNode {
  const branches: MindNode[] = [];

  for (const group of STACK_GROUPS) {
    const leaves = report.frameworks
      .filter((f) => group.categories.includes(f.category))
      .map<MindNode>((f) => ({
        id: `fw:${f.name}`,
        label: f.name,
        detail: f.status === "used" ? "Imported in your source code." : "Declared as a dependency, but no source file imports it.",
        evidenceIds: f.evidence.slice(0, MAX_IDS).map((e) => e.id),
        tone: f.status,
        color: group.color,
        children: [],
      }));
    if (leaves.length) branches.push(branch(`stack:${group.label}`, group.label, group.color, leaves));
  }

  const conceptLeaves = concepts.map<MindNode>((c) => ({
    id: `concept:${c.key}`,
    label: c.name,
    detail: `${c.description} (${STATUS_TEXT[c.status]}${c.score !== null ? `, ${c.score}%` : ""})`,
    evidenceIds: c.evidence.slice(0, MAX_IDS).map((e) => e.id),
    tone: c.status,
    color: CONCEPT_COLOR,
    children: [],
  }));
  if (conceptLeaves.length) branches.push(branch("concepts", "Concepts you use", CONCEPT_COLOR, conceptLeaves));

  const routesByFile = new Map<string, typeof report.relationships.routes>();
  for (const r of report.relationships.routes) {
    routesByFile.set(r.file, [...(routesByFile.get(r.file) ?? []), r]);
  }
  const routeLeaves = [...routesByFile.entries()].map<MindNode>(([file, routes]) => ({
    id: `routes:${file}`,
    label: `${baseName(file)} (${routes.length})`,
    detail: routes.map((r) => `${r.method} ${r.path ?? ""}`.trim()).join(" · "),
    evidenceIds: routes.slice(0, MAX_IDS).map((r) => r.evidence.id),
    color: ROUTE_COLOR,
    children: [],
  }));
  if (routeLeaves.length) branches.push(branch("routes", "API routes", ROUTE_COLOR, routeLeaves));

  const modelLeaves = report.relationships.models.map<MindNode>((m) => ({
    id: `model:${m.file}:${m.name}`,
    label: m.name,
    detail: [m.fields.length ? `Fields: ${m.fields.join(", ")}` : "No fields detected", m.refs.length ? `References: ${m.refs.join(", ")}` : ""]
      .filter(Boolean)
      .join(". "),
    evidenceIds: [m.evidence.id],
    color: MODEL_COLOR,
    children: [],
  }));
  if (modelLeaves.length) branches.push(branch("models", "Data models", MODEL_COLOR, modelLeaves));

  return { id: "root", label: projectName, detail: "Everything below was found in your code.", evidenceIds: [], color: "#1e1b4b", children: branches };
}

// --- layout: a left-to-right tree, one column per depth ---------------------------------------

export interface PlacedNode {
  node: MindNode;
  depth: number;
  x: number; // left edge
  y: number; // vertical centre
  width: number;
  collapsed: boolean;
}

export interface MindLayout {
  nodes: PlacedNode[];
  edges: { from: PlacedNode; to: PlacedNode }[];
  width: number;
  height: number;
}

export const NODE_HEIGHT = 30;
const ROW = 38;
const COLUMN_GAP = 56;
const MAX_LABEL = 30;

export function shortLabel(label: string): string {
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;
}

function nodeWidth(label: string, depth: number): number {
  const charWidth = depth === 0 ? 8.5 : 7;
  return Math.round(shortLabel(label).length * charWidth + 28);
}

export function layoutMindMap(root: MindNode, collapsed: ReadonlySet<string>): MindLayout {
  const visible = (n: MindNode) => (collapsed.has(n.id) ? [] : n.children);

  const colWidth: number[] = [];
  const measure = (n: MindNode, depth: number) => {
    colWidth[depth] = Math.max(colWidth[depth] ?? 0, nodeWidth(n.label, depth));
    visible(n).forEach((c) => measure(c, depth + 1));
  };
  measure(root, 0);
  const colX: number[] = [];
  colWidth.forEach((_w, i) => colX.push(i === 0 ? 0 : (colX[i - 1] ?? 0) + (colWidth[i - 1] ?? 0) + COLUMN_GAP));

  const nodes: PlacedNode[] = [];
  const edges: MindLayout["edges"] = [];
  let row = 0;
  const place = (n: MindNode, depth: number): PlacedNode => {
    const kids = visible(n);
    const placed: PlacedNode = {
      node: n,
      depth,
      x: colX[depth] ?? 0,
      y: 0,
      width: nodeWidth(n.label, depth),
      collapsed: collapsed.has(n.id) && n.children.length > 0,
    };
    nodes.push(placed);
    if (kids.length === 0) {
      placed.y = row * ROW + NODE_HEIGHT / 2;
      row += 1;
    } else {
      const children = kids.map((c) => place(c, depth + 1));
      placed.y = ((children[0]?.y ?? 0) + (children[children.length - 1]?.y ?? 0)) / 2;
      children.forEach((c) => edges.push({ from: placed, to: c }));
    }
    return placed;
  };
  place(root, 0);

  const width = Math.max(...nodes.map((p) => p.x + p.width));
  return { nodes, edges, width, height: Math.max(row, 1) * ROW };
}

export function countLeaves(root: MindNode): number {
  return root.children.length === 0 ? 1 : root.children.reduce((sum, c) => sum + countLeaves(c), 0);
}
