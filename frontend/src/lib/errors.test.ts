import { describe, expect, it } from "vitest";

import { ApiError } from "../api";
import { friendlyError, zipFileProblem } from "./errors";

describe("zipFileProblem", () => {
  it("accepts a small .zip", () => {
    expect(zipFileProblem({ name: "Project.ZIP", size: 1000 })).toBeNull();
  });

  it("explains unsupported archive types", () => {
    expect(zipFileProblem({ name: "server.rar", size: 1000 })).toMatch(/\.rar files aren't supported/);
    expect(zipFileProblem({ name: "README", size: 10 })).toMatch(/isn't supported/);
  });

  it("rejects archives over the size limit", () => {
    expect(zipFileProblem({ name: "big.zip", size: 51 * 1024 * 1024 })).toMatch(/over 50 MB/);
  });
});

describe("friendlyError", () => {
  it("keeps backend validation messages", () => {
    expect(friendlyError(new ApiError("Archive contains a symlink.", 400))).toBe("Archive contains a symlink.");
  });

  it("maps server and network failures to actionable text", () => {
    expect(friendlyError(new ApiError("Internal Server Error", 500))).toMatch(/backend and database/);
    expect(friendlyError(new ApiError("x", 413))).toMatch(/too large/);
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/Can't reach/);
    expect(friendlyError("weird")).toMatch(/Something went wrong/);
  });
});
