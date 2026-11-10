/** Where to go after signing in: back to the page that asked, but only same-site paths (no open redirect). */
export function safeRedirect(from: unknown): string {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//") || from.startsWith("/\\")) return "/app";
  return from;
}
