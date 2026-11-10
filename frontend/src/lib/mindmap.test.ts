import { describe, expect, it } from "vitest";

import type { AnalysisReport, PathwayConcept } from "../types";
import { buildMindMap, countLeaves, layoutMindMap, NODE_HEIGHT, shortLabel } from "./mindmap";
import { analysisGap } from "./report";

const ev = (id: string, file_path = "src/a.js", line_start = 1) => ({
  id, file_path, line_start, line_end: line_start, detector: "test", detail: "",
});

function report(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    schema_version: 1,
    summary: { file_count: 0, source_lines: 0, languages: {}, frameworks_used: [], frameworks_declared_only: [], route_count: 0, model_count: 0 },
    scan: { files: [], ignored_dirs: {}, languages: {}, categories: {} },
    frameworks: [],
    structure: { root_prefix: "", packages: [], layers: [] },
    relationships: { files_parsed: 0, routes: [], models: [], files_with_syntax_errors: [] },
    skipped_nested_archives: [],
    ...overrides,
  };
}

const MERN = report({
  frameworks: [
    { name: "React", category: "frontend", status: "used", evidence: [ev("ev-react")] },
    { name: "Express", category: "backend", status: "used", evidence: [ev("ev-express")] },
    { name: "Mongoose", category: "orm", status: "declared", evidence: [ev("ev-mongoose")] },
    { name: "JWT", category: "auth", status: "used", evidence: [ev("ev-jwt")] },
  ],
  relationships: {
    files_parsed: 3,
    routes: [
      { file: "server/routes/auth.js", method: "POST", path: "/login", receiver: "router", middleware: [], evidence: ev("ev-r1") },
      { file: "server/routes/auth.js", method: "POST", path: "/register", receiver: "router", middleware: [], evidence: ev("ev-r2") },
      { file: "server/routes/songs.js", method: "GET", path: "/", receiver: "router", middleware: [], evidence: ev("ev-r3") },
    ],
    models: [{ name: "User", file: "server/models/User.js", fields: ["email", "role"], refs: [], evidence: ev("ev-m1") }],
    files_with_syntax_errors: [],
  },
});

const CONCEPTS: PathwayConcept[] = [{
  key: "jwt-auth", name: "Token authentication (JWT)", level: 3, description: "Signed tokens.",
  evidence: [ev("ev-jwt")], resources: [], status: "learning", score: 60, attempts: 1, has_explanation: false,
}];

describe("buildMindMap", () => {
  it("groups findings into branches and every leaf cites evidence", () => {
    const root = buildMindMap("SoundSoul", MERN, CONCEPTS);
    expect(root.label).toBe("SoundSoul");
    expect(root.children.map((b) => b.label)).toEqual(["Frontend", "Backend", "Data", "Security", "Concepts you use", "API routes", "Data models"]);

    const leaves = root.children.flatMap((b) => b.children);
    expect(leaves.every((l) => l.evidenceIds.length > 0)).toBe(true);
    expect(leaves.find((l) => l.label === "Mongoose")?.tone).toBe("declared");
    const routes = root.children.find((b) => b.id === "routes")!;
    expect(routes.children.map((l) => l.label)).toEqual(["auth.js (2)", "songs.js (1)"]);
    expect(routes.children[0]?.detail).toBe("POST /login · POST /register");
    expect(root.children.find((b) => b.id === "concepts")?.children[0]?.detail).toContain("learning, 60%");
  });

  it("leaves out empty branches", () => {
    expect(buildMindMap("Empty", report(), []).children).toEqual([]);
  });
});

describe("layoutMindMap", () => {
  it("places one row per visible leaf, parents centred on their children", () => {
    const root = buildMindMap("SoundSoul", MERN, CONCEPTS);
    const layout = layoutMindMap(root, new Set());
    expect(layout.nodes).toHaveLength(1 + root.children.length + countLeaves(root));
    expect(layout.height).toBe(countLeaves(root) * 38);
    const rootNode = layout.nodes[0]!;
    const ys = layout.nodes.filter((n) => n.depth === 1).map((n) => n.y);
    expect(rootNode.y).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2);
    expect(layout.nodes.every((n) => n.y >= NODE_HEIGHT / 2 && n.x + n.width <= layout.width)).toBe(true);
    // Columns never overlap.
    const right0 = rootNode.x + rootNode.width;
    expect(layout.nodes.filter((n) => n.depth === 1).every((n) => n.x > right0)).toBe(true);
  });

  it("collapsing a branch hides its leaves", () => {
    const root = buildMindMap("SoundSoul", MERN, CONCEPTS);
    const all = layoutMindMap(root, new Set()).nodes.length;
    const folded = layoutMindMap(root, new Set(["routes"]));
    expect(folded.nodes.length).toBe(all - 2);
    expect(folded.nodes.find((n) => n.node.id === "routes")?.collapsed).toBe(true);
  });
});

describe("shortLabel", () => {
  it("truncates long labels", () => {
    expect(shortLabel("a".repeat(40))).toHaveLength(30);
    expect(shortLabel("short")).toBe("short");
  });
});

describe("analysisGap", () => {
  const file = (path: string, category: string, language: string | null) =>
    ({ path, category, language, size: 1, is_binary: false, line_count: 1, sensitive: false });

  it("is null when something was found", () => {
    expect(analysisGap(MERN)).toBeNull();
  });

  it("explains an upload with no code", () => {
    const r = report({ scan: { files: [file("x.pdf", "asset", null), file("x.fig", "other", null)], ignored_dirs: {}, languages: {}, categories: {} } });
    expect(analysisGap(r)).toMatch(/no source code, only 2 other files/);
  });

  it("points out a missing manifest and unsupported languages", () => {
    const r = report({ scan: { files: [file("src/A.java", "source", "Java"), file("src/b.css", "source", "CSS")], ignored_dirs: {}, languages: {}, categories: {} } });
    const gap = analysisGap(r)!;
    expect(gap).toMatch(/no package\.json/);
    expect(gap).toMatch(/Java code isn't analysed yet/);
    expect(gap).not.toMatch(/CSS/);
  });
});
