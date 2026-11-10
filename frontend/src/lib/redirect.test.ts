import { describe, expect, it } from "vitest";

import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
  it("keeps same-site paths", () => {
    expect(safeRedirect("/account?tab=1")).toBe("/account?tab=1");
  });

  it("falls back to /app for anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "app", undefined, 42]) {
      expect(safeRedirect(bad)).toBe("/app");
    }
  });
});
