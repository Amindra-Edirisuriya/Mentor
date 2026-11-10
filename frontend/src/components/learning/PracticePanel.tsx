import { useEffect, useRef, useState, type FormEvent } from "react";

import { answerQuestion, getPathway, startPractice } from "../../api";
import { friendlyError } from "../../lib/errors";
import { formatClock } from "../../lib/learning";
import type { GradeResult, PathwayConcept, PracticeMode, PracticeSession } from "../../types";
import { Badge, EvidenceList, Section, Spinner } from "../ui";
import { ErrorText, ScorePill, StatusBadge, type EvidenceCtx } from "./shared";

const VIVA_SECONDS = 120;

// Minimal typing for the browser speech API (Chrome/Edge expose it as webkitSpeechRecognition).
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
};

function speechRecognition(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function useCountdown(active: boolean, seconds: number, resetKey: unknown): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => setLeft(seconds), [seconds, resetKey]);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setLeft((s) => s - 1), 1000);
    return () => window.clearInterval(id);
  }, [active, resetKey]);
  return left;
}

function Setup({
  concepts,
  initialConcept,
  onStart,
}: {
  concepts: PathwayConcept[];
  initialConcept: string | null;
  onStart: (mode: PracticeMode, count: number, concept?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<PracticeMode>("quiz");
  const [concept, setConcept] = useState(initialConcept ?? "");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onStart(mode, count, concept || undefined);
    } finally {
      setBusy(false);
    }
  }

  const modes: { id: PracticeMode; title: string; text: string }[] = [
    { id: "quiz", title: "Concept quiz", text: "Short questions that check you understand what your code does." },
    { id: "viva", title: "Viva practice", text: "Examiner-style 'why' and 'how' questions, with a 2-minute timer per answer." },
  ];

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Practice mode</legend>
        {modes.map((m) => (
          <label
            key={m.id}
            className={`cursor-pointer rounded-xl border p-4 transition ${mode === m.id ? "border-brand-indigo bg-brand-indigo/5 ring-2 ring-brand-indigo/20" : "border-slate-200 hover:border-slate-300"}`}
          >
            <input type="radio" name="mode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} className="sr-only" />
            <span className="block font-semibold text-slate-900">{m.title}</span>
            <span className="mt-1 block text-sm text-slate-500">{m.text}</span>
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <label className="text-sm font-medium text-slate-700">
          Focus
          <select value={concept} onChange={(e) => setConcept(e.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
            <option value="">My weakest concepts (recommended)</option>
            {concepts.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
                {c.score !== null ? ` (${c.score}%)` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Questions
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
            {[3, 5, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
        {busy && <Spinner />}
        {busy ? "Writing questions about your code…" : "Start practice"}
      </button>
    </form>
  );
}

function GradeCard({ grade }: { grade: GradeResult }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <ScorePill score={grade.score} />
        <span className="text-sm font-medium text-slate-800">{grade.feedback}</span>
      </div>
      {grade.missing_points.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">You could also mention</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
            {grade.missing_points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer font-medium">What a strong answer covers</summary>
        <ul className="mt-1 list-disc pl-5">
          {grade.key_points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </details>
      <p className="flex items-center gap-2 text-xs text-slate-500">
        Concept progress: <StatusBadge status={grade.concept.status} /> {grade.concept.score}% after {grade.concept.attempts} answer(s)
      </p>
    </div>
  );
}

function Runner({ projectId, session, ctx, onDone }: { projectId: string; session: PracticeSession; ctx: EvidenceCtx; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const viva = session.mode === "viva";
  const left = useCountdown(viva && !grade, VIVA_SECONDS, index);
  const question = session.questions[index];
  const finished = index >= session.questions.length;
  const Speech = speechRecognition();

  useEffect(() => () => recognition.current?.stop(), []);

  function toggleSpeech() {
    if (!Speech) return;
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const rec = new Speech();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0]?.transcript ?? "").join(" ");
      setAnswer((prev) => `${prev} ${text}`.trim());
    };
    rec.onend = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim()) return;
    recognition.current?.stop();
    setBusy(true);
    setError(null);
    try {
      const result = await answerQuestion(projectId, session.id, index, answer);
      setGrade(result);
      setScores((s) => [...s, result.score]);
    } catch (err) {
      setError(friendlyError(err, "Couldn't grade that answer."));
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setIndex((i) => i + 1);
    setAnswer("");
    setGrade(null);
  }

  if (finished || !question) {
    const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-slate-500">{viva ? "Viva" : "Quiz"} complete</p>
        <p className="text-4xl font-extrabold text-slate-900">{average}%</p>
        <p className="text-sm text-slate-600">
          Average over {scores.length} answer(s). Your progress has been saved. Check the Progress tab to see how you're improving.
        </p>
        <button onClick={onDone} className="btn-primary">
          Practise again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          Question {index + 1} of {session.questions.length}
        </span>
        <div className="flex items-center gap-2">
          <Badge tone="frontend">{question.concept_name}</Badge>
          <Badge tone={question.difficulty === "hard" ? "failed" : question.difficulty === "medium" ? "declared" : "used"}>{question.difficulty}</Badge>
          {viva && !grade && (
            <span className={`rounded-full px-2 py-0.5 font-mono font-semibold ${left < 0 ? "bg-rose-100 text-rose-700" : left <= 30 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
              {formatClock(left)}
            </span>
          )}
        </div>
      </div>
      <p className="text-base font-semibold leading-relaxed text-slate-900">{question.question}</p>
      <EvidenceList items={question.evidence} prefix={ctx.prefix} />

      {grade ? (
        <>
          <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Your answer</p>
            <p className="mt-1 whitespace-pre-wrap">{answer}</p>
          </div>
          <GradeCard grade={grade} />
          <button onClick={next} className="btn-primary w-full py-2.5">
            {index + 1 < session.questions.length ? "Next question →" : "See results"}
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="sr-only" htmlFor="answer">
            Your answer
          </label>
          <textarea
            id="answer"
            rows={6}
            maxLength={4000}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={viva ? "Answer as you would to an examiner: explain the why, not just the what…" : "Explain in your own words…"}
            className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-brand-indigo focus:ring-4 focus:ring-brand-indigo/10"
          />
          <ErrorText>{error}</ErrorText>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !answer.trim()} className="btn-primary flex-1 py-2.5">
              {busy && <Spinner />}
              {busy ? "Grading…" : "Submit answer"}
            </button>
            {Speech && (
              <button
                type="button"
                onClick={toggleSpeech}
                aria-pressed={listening}
                className={`rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${listening ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
              >
                {listening ? "● Stop speaking" : "🎤 Speak answer"}
              </button>
            )}
            <button type="button" onClick={next} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700">
              Skip
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function PracticePanel({ projectId, ctx, initialConcept }: { projectId: string; ctx: EvidenceCtx; initialConcept: string | null }) {
  const [concepts, setConcepts] = useState<PathwayConcept[]>([]);
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPathway(projectId)
      .then((p) => setConcepts(p.concepts))
      .catch((err: unknown) => setError(friendlyError(err)));
  }, [projectId]);

  async function start(mode: PracticeMode, count: number, concept?: string) {
    setError(null);
    try {
      setSession(await startPractice(projectId, mode, count, concept));
    } catch (err) {
      setError(friendlyError(err, "Couldn't create questions."));
    }
  }

  return (
    <Section title={session ? (session.mode === "viva" ? "Viva practice" : "Concept quiz") : "Practise with questions about your own code"}>
      <div className="mx-auto max-w-2xl space-y-4">
        <ErrorText>{error}</ErrorText>
        {session ? (
          <Runner key={session.id} projectId={projectId} session={session} ctx={ctx} onDone={() => setSession(null)} />
        ) : (
          <Setup concepts={concepts} initialConcept={initialConcept} onStart={start} />
        )}
      </div>
    </Section>
  );
}
