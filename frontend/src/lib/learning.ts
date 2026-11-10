import type { ConceptStatus, Evidence, Presentation } from "../types";
import { formatLocation } from "./report";

export const STATUS_LABEL: Record<ConceptStatus, string> = {
  not_started: "Not started",
  learning: "Learning",
  mastered: "Mastered",
};

/** Tailwind classes for a 0-100 score: red below 50, amber below 75 (the mastery line), green above. */
export function scoreTone(score: number): string {
  if (score >= 75) return "text-emerald-700 bg-emerald-50 ring-emerald-600/20";
  if (score >= 50) return "text-amber-700 bg-amber-50 ring-amber-600/20";
  return "text-rose-700 bg-rose-50 ring-rose-600/20";
}

/** "m:ss" for the rehearsal timer; negative values (over time) get a leading "-". */
export function formatClock(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? "-" : "";
  const s = Math.abs(Math.trunc(totalSeconds));
  return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Markdown export of a deck, with each bullet's evidence locations, for slides tools or notes. */
export function presentationToMarkdown(deck: Presentation, evidence: Map<string, Evidence>, prefix = ""): string {
  const lines = [`# ${deck.title}`, "", `_${deck.minutes}-minute presentation · ${deck.slides.length} slides_`, ""];
  deck.slides.forEach((slide, i) => {
    lines.push(`## ${i + 1}. ${slide.title}`, "");
    for (const bullet of slide.bullets) {
      const where = bullet.evidence_ids
        .map((id) => evidence.get(id))
        .filter((e): e is Evidence => e !== undefined)
        .map((e) => `\`${formatLocation(e, prefix)}\``)
        .join(", ");
      lines.push(`- ${bullet.text}${where ? ` (${where})` : ""}`);
    }
    if (slide.notes) lines.push("", `> Speaker notes: ${slide.notes}`);
    lines.push("");
  });
  return lines.join("\n");
}
