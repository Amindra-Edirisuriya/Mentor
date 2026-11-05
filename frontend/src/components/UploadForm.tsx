import { useRef, useState, type DragEvent, type FormEvent } from "react";

import { uploadProject } from "../api";
import { friendlyError, zipFileProblem } from "../lib/errors";
import type { ProjectCreated } from "../types";
import { Spinner } from "./ui";

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadForm({ onUploaded }: { onUploaded: (created: ProjectCreated) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function choose(next: File | null) {
    setFile(next);
    setError(next ? zipFileProblem(next) : null);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0] ?? null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    const problem = zipFileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await uploadProject(file, name.trim() || undefined);
      if (created.status === "failed") {
        setError(`We couldn't analyse that archive: ${created.error ?? "unknown error"}`);
      }
      onUploaded(created);
      setFile(null);
      setName("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(friendlyError(err, "Upload failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const invalid = file !== null && zipFileProblem(file) !== null;

  return (
    <form onSubmit={submit} className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
          dragging
            ? "border-brand-cyan bg-cyan-50/60"
            : invalid
              ? "border-rose-300 bg-rose-50/50"
              : "border-slate-300 bg-slate-50 hover:border-brand-violet/60 hover:bg-violet-50/40"
        }`}
      >
        <svg className="h-8 w-8 text-brand-indigo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        {file ? (
          <span className="w-full truncate text-sm font-medium text-slate-800" title={file.name}>
            {file.name} <span className="font-normal text-slate-500">· {formatSize(file.size)}</span>
          </span>
        ) : (
          <span className="text-sm text-slate-600">
            <span className="font-semibold text-brand-indigo">Choose a ZIP</span> or drag it here
          </span>
        )}
        <span className="text-xs text-slate-400">.zip only · up to 50 MB</span>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
      </label>

      <input
        type="text"
        placeholder="Project name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-violet focus:outline-none focus:ring-2 focus:ring-brand-violet/20"
      />

      <button type="submit" disabled={!file || busy || invalid} className="btn-primary w-full">
        {busy ? (
          <>
            <Spinner /> Analysing your project…
          </>
        ) : (
          "Upload & analyse"
        )}
      </button>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <p className="flex gap-1.5 text-xs leading-relaxed text-slate-500">
        <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M10 1.944A11.954 11.954 0 0 1 2.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0 1 10 1.944Zm3.707 6.763a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4Z"
            clipRule="evenodd"
          />
        </svg>
        Your code is never executed. Archives with unsafe paths, symlinks or excessive size are rejected.
      </p>
    </form>
  );
}
