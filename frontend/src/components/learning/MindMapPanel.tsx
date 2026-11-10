import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { getPathway } from "../../api";
import { friendlyError } from "../../lib/errors";
import { buildMindMap, layoutMindMap, NODE_HEIGHT, shortLabel, type MindNode, type PlacedNode } from "../../lib/mindmap";
import type { AnalysisReport, PathwayConcept } from "../../types";
import { Empty, Section, Skeleton } from "../ui";
import { ErrorText, EvidenceChips, type EvidenceCtx } from "./shared";

const PAD = 16;
const FONT = "Inter, system-ui, sans-serif";
const TONE_DOT: Record<string, string> = { mastered: "#10b981", learning: "#f59e0b", not_started: "#94a3b8" };

// Colours are SVG attributes, not Tailwind classes, so a downloaded .svg looks the same.
function NodeShape({ p, selected }: { p: PlacedNode; selected: boolean }) {
  const { node, depth } = p;
  const top = p.y - NODE_HEIGHT / 2;
  const declared = node.tone === "declared";
  const fill = depth === 0 ? node.color : depth === 1 ? node.color : "#ffffff";
  const text = depth <= 1 ? "#ffffff" : declared ? "#64748b" : "#0f172a";
  const dot = node.tone ? TONE_DOT[node.tone] : undefined;
  return (
    <>
      <rect
        x={p.x}
        y={top}
        width={p.width}
        height={NODE_HEIGHT}
        rx={depth === 0 ? 10 : 15}
        fill={fill}
        stroke={selected ? "#0f172a" : depth >= 2 ? node.color : "none"}
        strokeWidth={selected ? 2 : 1.2}
        strokeDasharray={declared ? "4 3" : undefined}
      />
      {dot && <circle cx={p.x + p.width - 10} cy={p.y} r={3.5} fill={dot} />}
      <text
        x={p.x + 14}
        y={p.y + 4.5}
        fontFamily={FONT}
        fontSize={depth === 0 ? 14 : 12}
        fontWeight={depth <= 1 ? 600 : 500}
        fill={text}
      >
        {shortLabel(node.label)}
        {p.collapsed ? ` +${node.children.length}` : ""}
      </text>
    </>
  );
}

function downloadSvg(svg: SVGSVGElement, name: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^A-Za-z0-9._-]+/g, "-") || "project"}-mind-map.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

export function MindMapPanel({
  projectId,
  projectName,
  report,
  ctx,
}: {
  projectId: string;
  projectName: string;
  report: AnalysisReport;
  ctx: EvidenceCtx;
}) {
  const [concepts, setConcepts] = useState<PathwayConcept[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState("root");
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    setConcepts(null);
    setSelectedId("root");
    setCollapsed(new Set());
    getPathway(projectId)
      .then((p) => !cancelled && setConcepts(p.concepts))
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(friendlyError(err, "Couldn't load concepts; showing the tech stack only."));
        setConcepts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const root = useMemo(() => (concepts ? buildMindMap(projectName, report, concepts) : null), [concepts, projectName, report]);
  const layout = useMemo(() => (root ? layoutMindMap(root, collapsed) : null), [root, collapsed]);

  if (!root || !layout) return <Skeleton className="h-80 w-full" />;
  if (root.children.length === 0) {
    return (
      <Section title="Mind map">
        <Empty>Nothing was detected in this project yet, so there's nothing to map. See the note above the tabs.</Empty>
      </Section>
    );
  }

  const selected = layout.nodes.find((p) => p.node.id === selectedId)?.node ?? root;
  const branchIds = root.children.map((b) => b.id);
  const activate = (node: MindNode) => {
    setSelectedId(node.id);
    if (node.id !== "root" && node.children.length) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
    }
  };
  const onKey = (e: KeyboardEvent, node: MindNode) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate(node);
    }
  };

  return (
    <div className="space-y-4">
      <Section
        title="Mind map"
        aside={
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50" onClick={() => setCollapsed(new Set())}>
              Expand all
            </button>
            <button className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50" onClick={() => setCollapsed(new Set(branchIds))}>
              Collapse all
            </button>
            <button
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-indigo ring-1 ring-brand-indigo/30 hover:bg-brand-indigo/5"
              onClick={() => svgRef.current && downloadSvg(svgRef.current, projectName)}
            >
              Download SVG
            </button>
          </div>
        }
      >
        <ErrorText>{error}</ErrorText>
        <p className="mb-3 text-xs text-slate-500">
          Built from the analysis only: every node is something VIFE found in your code. Click a branch to fold it, and click any node to
          see where it lives. Dashed outline: declared but never imported. Dots show concept progress.
        </p>
        <div className="overflow-x-auto rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200">
          <svg
            ref={svgRef}
            width={layout.width + PAD * 2}
            height={layout.height + PAD * 2}
            viewBox={`0 0 ${layout.width + PAD * 2} ${layout.height + PAD * 2}`}
            role="tree"
            aria-label={`Mind map of ${projectName}`}
          >
            <rect width="100%" height="100%" fill="#f8fafc" />
            <g transform={`translate(${PAD} ${PAD})`}>
              {layout.edges.map(({ from, to }) => {
                const x1 = from.x + from.width;
                const mid = (x1 + to.x) / 2;
                return (
                  <path
                    key={`${from.node.id}>${to.node.id}`}
                    d={`M${x1},${from.y} C${mid},${from.y} ${mid},${to.y} ${to.x},${to.y}`}
                    fill="none"
                    stroke={to.node.color}
                    strokeOpacity={0.45}
                    strokeWidth={1.6}
                  />
                );
              })}
              {layout.nodes.map((p) => (
                <g
                  key={p.node.id}
                  role="treeitem"
                  aria-label={p.node.label}
                  aria-selected={p.node.id === selected.id}
                  aria-expanded={p.depth === 1 ? !p.collapsed : undefined}
                  tabIndex={0}
                  onClick={() => activate(p.node)}
                  onKeyDown={(e) => onKey(e, p.node)}
                  style={{ cursor: "pointer", outline: "none" }}
                >
                  <title>{p.node.label}</title>
                  <NodeShape p={p} selected={p.node.id === selected.id} />
                </g>
              ))}
            </g>
          </svg>
        </div>
      </Section>

      <Section title={selected.label}>
        <p className="text-sm text-slate-700">{selected.detail}</p>
        {selected.evidenceIds.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-slate-500">Where it is in your code</p>
            <EvidenceChips ids={selected.evidenceIds} ctx={ctx} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">Select a node to see the files and lines behind it.</p>
        )}
      </Section>
    </div>
  );
}
