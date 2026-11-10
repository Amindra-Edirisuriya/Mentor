import { useCallback, useEffect, useState } from "react";

import { ApiError, generatePresentation, getPresentation } from "../../api";
import { friendlyError } from "../../lib/errors";
import { formatClock, presentationToMarkdown } from "../../lib/learning";
import type { Presentation } from "../../types";
import { Empty, Section, Skeleton, Spinner } from "../ui";
import { EvidenceChips, ErrorText, type EvidenceCtx } from "./shared";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** Opens a clean print view (one slide per page) so the browser can print or save it as PDF. */
function printDeck(deck: Presentation) {
  const win = window.open("", "_blank");
  if (!win) return;
  const slides = deck.slides
    .map(
      (s, i) => `<section><p class="n">${i + 1} / ${deck.slides.length}</p><h2>${escapeHtml(s.title)}</h2><ul>${s.bullets
        .map((b) => `<li>${escapeHtml(b.text)}</li>`)
        .join("")}</ul>${s.notes ? `<p class="notes"><b>Notes:</b> ${escapeHtml(s.notes)}</p>` : ""}</section>`,
    )
    .join("");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(deck.title)}</title><style>
    body{font-family:Inter,system-ui,sans-serif;margin:0;color:#0f172a}
    section{page-break-after:always;padding:48px 64px;min-height:85vh;border-bottom:1px solid #e2e8f0}
    h1{font-size:40px;margin:0 0 8px} h2{font-size:30px;margin:0 0 24px;color:#4f46e5}
    li{font-size:20px;margin:10px 0;line-height:1.4} .n{color:#94a3b8;font-size:12px}
    .notes{margin-top:32px;font-size:13px;color:#475569;border-top:1px dashed #cbd5e1;padding-top:12px}
  </style></head><body><section><h1>${escapeHtml(deck.title)}</h1><p>${deck.minutes}-minute presentation</p></section>${slides}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Viewer({ deck, ctx }: { deck: Presentation; ctx: EvidenceCtx }) {
  const [index, setIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(true);
  const [rehearsing, setRehearsing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const slide = deck.slides[index];
  const go = useCallback((delta: number) => setIndex((i) => Math.max(0, Math.min(deck.slides.length - 1, i + delta))), [deck.slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  useEffect(() => {
    if (!rehearsing) return;
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [rehearsing]);

  if (!slide) return null;
  const budget = deck.minutes * 60;
  const remaining = budget - elapsed;
  const perSlide = Math.round(budget / deck.slides.length);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-brand-night p-6 text-white shadow-lg sm:p-10" style={{ minHeight: "22rem" }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(124,58,237,0.35),transparent_60%)]" aria-hidden />
        <div className="relative">
          <p className="text-xs font-medium text-cyan-200/80">
            {deck.title} · {index + 1} / {deck.slides.length}
          </p>
          <h3 className="mt-3 text-2xl font-bold sm:text-3xl">{slide.title}</h3>
          <ul className="mt-6 space-y-3">
            {slide.bullets.map((b, i) => (
              <li key={i} className="flex gap-3 text-base sm:text-lg">
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" aria-hidden />
                <span>{b.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button onClick={() => go(-1)} disabled={index === 0} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40">
            ← Prev
          </button>
          <button onClick={() => go(1)} disabled={index === deck.slides.length - 1} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40">
            Next →
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              if (!rehearsing && elapsed === 0) setIndex(0);
              setRehearsing((r) => !r);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${rehearsing ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-brand-indigo/10 text-brand-indigo"}`}
          >
            {rehearsing ? "Pause rehearsal" : elapsed ? "Resume rehearsal" : "Start rehearsal"}
          </button>
          {elapsed > 0 && (
            <>
              <span className={`rounded-full px-2.5 py-1 font-mono text-sm font-semibold ${remaining < 0 ? "bg-rose-100 text-rose-700" : remaining < 60 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                {formatClock(remaining)}
              </span>
              <button
                onClick={() => {
                  setRehearsing(false);
                  setElapsed(0);
                }}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Reset
              </button>
            </>
          )}
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} /> Notes
          </label>
        </div>
      </div>
      {elapsed > 0 && <p className="text-xs text-slate-500">Aim for about {formatClock(perSlide)} per slide.</p>}

      {showNotes && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Speaker notes</p>
          <p className="mt-1 text-sm text-slate-700">{slide.notes || "No notes for this slide."}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence behind this slide</p>
          <div className="mt-1 space-y-1">
            {slide.bullets.map((b, i) => (
              <EvidenceChips key={i} ids={b.evidence_ids} ctx={ctx} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <button onClick={() => download(`${deck.title.replace(/[^\w-]+/g, "_")}.md`, presentationToMarkdown(deck, ctx.index, ctx.prefix))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
          Download Markdown
        </button>
        <button onClick={() => printDeck(deck)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
          Print / save as PDF
        </button>
        <span className="self-center text-xs text-slate-400">
          Model: {deck.model}
          {deck.rejected_bullets > 0 && ` · ${deck.rejected_bullets} uncited bullet(s) removed`}
        </span>
      </div>
    </div>
  );
}

export function PresentationPanel({ projectId, ctx }: { projectId: string; ctx: EvidenceCtx }) {
  const [deck, setDeck] = useState<Presentation | null>(null);
  const [minutes, setMinutes] = useState(10);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPresentation(projectId)
      .then((d) => !cancelled && setDeck(d))
      .catch((err: unknown) => !cancelled && !(err instanceof ApiError && err.status === 404) && setError(friendlyError(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setDeck(await generatePresentation(projectId, minutes));
    } catch (err) {
      setError(friendlyError(err, "Couldn't generate the presentation."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Presentation"
      aside={
        <div className="flex items-center gap-2">
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Length in minutes" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">
            {[5, 10, 15, 20].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
          <button onClick={generate} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">
            {busy ? (
              <>
                <Spinner className="h-3.5 w-3.5" /> Generating…
              </>
            ) : deck ? (
              "Regenerate"
            ) : (
              "Generate slides"
            )}
          </button>
        </div>
      }
    >
      <ErrorText>{error}</ErrorText>
      {loading || busy ? (
        <Skeleton className="h-80 w-full" />
      ) : deck ? (
        <Viewer key={`${deck.title}-${deck.slides.length}-${deck.minutes}`} deck={deck} ctx={ctx} />
      ) : (
        <Empty>Generate a slide deck about your project for a demo or viva. Every bullet is backed by evidence from your code, and you can rehearse it with a timer.</Empty>
      )}
    </Section>
  );
}
