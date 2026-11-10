import { describe, expect, it } from "vitest";

import type { Evidence, Presentation } from "../types";
import { formatClock, presentationToMarkdown, scoreTone } from "./learning";

describe("formatClock", () => {
  it("formats minutes and seconds, including overtime", () => {
    expect(formatClock(600)).toBe("10:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(-7)).toBe("-0:07");
  });
});

describe("scoreTone", () => {
  it("uses the mastery threshold", () => {
    expect(scoreTone(80)).toContain("emerald");
    expect(scoreTone(60)).toContain("amber");
    expect(scoreTone(10)).toContain("rose");
  });
});

describe("presentationToMarkdown", () => {
  it("renders slides, bullets with locations and notes", () => {
    const ev: Evidence = { id: "ev-1", file_path: "app/server/a.js", line_start: 4, line_end: 4, detector: "d", detail: "" };
    const deck: Presentation = {
      model: "fake",
      title: "SoundSoul",
      minutes: 5,
      rejected_bullets: 0,
      slides: [
        {
          title: "API",
          notes: "Explain routing.",
          bullets: [
            { text: "GET /songs", label: "verified", evidence_ids: ["ev-1", "ev-missing"], downgraded_from: null, dropped_evidence_ids: [] },
          ],
        },
      ],
    };
    const md = presentationToMarkdown(deck, new Map([["ev-1", ev]]), "app");
    expect(md).toContain("# SoundSoul");
    expect(md).toContain("## 1. API");
    expect(md).toContain("- GET /songs (`server/a.js:4`)");
    expect(md).toContain("> Speaker notes: Explain routing.");
  });
});
