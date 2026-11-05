import { useState, type FormEvent } from "react";

import { uploadProject } from "../api";
import type { ProjectCreated } from "../types";

export function UploadForm({ onUploaded }: { onUploaded: (created: ProjectCreated) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const created = await uploadProject(file, name.trim() || undefined);
      if (created.status === "failed") setError(created.error ?? "Analysis failed.");
      onUploaded(created);
      setFile(null);
      setName("");
      (event.target as HTMLFormElement).reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="file"
        accept=".zip,application/zip"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-slate-200 file:px-2 file:py-1"
      />
      <input
        type="text"
        placeholder="Project name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={!file || busy}
        className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {busy ? "Analysing…" : "Upload & analyse ZIP"}
      </button>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <p className="text-xs text-slate-500">
        Uploaded code is never executed. Archives with unsafe paths, symlinks or excessive size are rejected.
      </p>
    </form>
  );
}
