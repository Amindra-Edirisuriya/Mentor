import { ApiError } from "../api";

/** Turn any thrown value into a message a user can act on. */
export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ApiError) {
    if (err.status === 413) return "That file is too large. Remove folders like node_modules or dist and try again.";
    if (err.status === 404) return "We couldn't find that. It may have been removed — try refreshing.";
    if (err.status === 503) return `This feature isn't available right now. ${err.message}`;
    if (err.status >= 500) return "The VIFE server hit a problem. Check that the backend and database are running.";
    return err.message || fallback;
  }
  // fetch() rejects with a TypeError when the server can't be reached at all.
  if (err instanceof TypeError) return "Can't reach the VIFE backend. Is it running on port 8000?";
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Client-side check so obvious mistakes (e.g. a .rar) get a clear message before uploading. */
export function zipFileProblem(file: File | { name: string; size: number }, maxMb = 50): string | null {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".zip")) {
    const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
    const kind = ext ? `${ext} files aren't` : "That file isn't";
    return `${kind} supported yet. Please compress your project folder as a .zip and upload that.`;
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `That ZIP is over ${maxMb} MB. Remove folders like node_modules, dist or .git and try again.`;
  }
  return null;
}
