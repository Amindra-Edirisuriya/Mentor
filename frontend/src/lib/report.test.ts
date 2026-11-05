import { describe, expect, it } from "vitest";

import type { RouteFinding } from "../types";
import { buildEvidenceIndex, formatLocation, groupRoutesByFile, languageShares, stripPrefix } from "./report";

const ev = (id: string, file_path: string, line_start = 0, line_end = line_start) => ({
  id,
  file_path,
  line_start,
  line_end,
  detector: "test",
  detail: "",
});

describe("formatLocation", () => {
  it("formats whole-file, single-line and ranges", () => {
    expect(formatLocation(ev("ev-1", "a/b.js"))).toBe("a/b.js");
    expect(formatLocation(ev("ev-1", "a/b.js", 12))).toBe("a/b.js:12");
    expect(formatLocation(ev("ev-1", "a/b.js", 12, 14))).toBe("a/b.js:12-14");
  });

  it("strips the root prefix", () => {
    expect(formatLocation(ev("ev-1", "app/server/x.js", 3), "app")).toBe("server/x.js:3");
  });
});

describe("stripPrefix", () => {
  it("only strips a whole leading folder", () => {
    expect(stripPrefix("app/x.js", "app")).toBe("x.js");
    expect(stripPrefix("application/x.js", "app")).toBe("application/x.js");
    expect(stripPrefix("x.js", "")).toBe("x.js");
  });
});

describe("buildEvidenceIndex", () => {
  it("finds nested evidence and ignores look-alikes", () => {
    const report = {
      frameworks: [{ name: "Express", evidence: [ev("ev-aaa", "p.json", 3)] }],
      relationships: { routes: [{ method: "GET", evidence: ev("ev-bbb", "r.js", 4) }] },
      other: { id: "not-evidence", file_path: "x", detector: "d", line_start: 1 },
    };
    const index = buildEvidenceIndex(report);
    expect([...index.keys()].sort()).toEqual(["ev-aaa", "ev-bbb"]);
    expect(index.get("ev-bbb")?.file_path).toBe("r.js");
  });
});

describe("groupRoutesByFile", () => {
  it("groups by file in sorted order, preserving route order", () => {
    const route = (file: string, path: string): RouteFinding => ({
      file,
      method: "GET",
      path,
      receiver: "router",
      middleware: [],
      evidence: ev(`ev-${path}`, file, 1),
    });
    const groups = groupRoutesByFile([route("b.js", "/1"), route("a.js", "/2"), route("b.js", "/3")]);
    expect(groups.map(([file, routes]) => [file, routes.map((r) => r.path)])).toEqual([
      ["a.js", ["/2"]],
      ["b.js", ["/1", "/3"]],
    ]);
  });
});

describe("languageShares", () => {
  it("sorts by lines and computes percentages", () => {
    expect(languageShares({ CSS: 25, JavaScript: 75 })).toEqual([
      { name: "JavaScript", lines: 75, percent: 75 },
      { name: "CSS", lines: 25, percent: 25 },
    ]);
    expect(languageShares({})).toEqual([]);
  });
});
