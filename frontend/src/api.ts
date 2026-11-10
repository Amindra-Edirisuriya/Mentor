import type {
  AnalysisReport,
  Explanation,
  GradeResult,
  Pathway,
  PracticeMode,
  PracticeSession,
  Presentation,
  Progress,
  Project,
  ProjectCreated,
  ProjectSummary,
  User,
} from "./types";

const BASE = "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};

/** Called when a signed-in request gets 401 (e.g. the session expired), so the app can show sign-in. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);
  if (response.status === 401 && !path.startsWith("/auth/")) onUnauthorized();
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
        detail = body.detail;
      }
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new ApiError(detail, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// --- Accounts (session is an httpOnly cookie the browser sends automatically) ---

export const getMe = () => request<User>("/auth/me");

export const register = (name: string, email: string, password: string) =>
  request<User>("/auth/register", json("POST", { name, email, password }));

export const login = (email: string, password: string) =>
  request<User>("/auth/login", json("POST", { email, password }));

export const logout = () => request<void>("/auth/logout", { method: "POST" });

export const updateProfile = (name: string) => request<User>("/auth/me", json("PATCH", { name }));

export const changePassword = (current_password: string, new_password: string) =>
  request<void>("/auth/change-password", json("POST", { current_password, new_password }));

export const forgotPassword = (email: string) =>
  request<{ detail: string }>("/auth/forgot-password", json("POST", { email }));

export const resetPassword = (token: string, new_password: string) =>
  request<void>("/auth/reset-password", json("POST", { token, new_password }));

export const deleteAccount = (password: string) => request<void>("/auth/me", json("DELETE", { password }));

// --- Projects ---

export function uploadProject(file: File, name?: string): Promise<ProjectCreated> {
  const form = new FormData();
  form.append("file", file);
  if (name) form.append("name", name);
  return request<ProjectCreated>("/projects", { method: "POST", body: form });
}

export const listProjects = () => request<Project[]>("/projects");

export const getReport = (projectId: string) =>
  request<{ run_id: string; report: AnalysisReport }>(`/projects/${projectId}/report`);

export const getSummary = (projectId: string) =>
  request<{ run_id: string; summary: ProjectSummary }>(`/projects/${projectId}/summary`);

export const generateSummary = (projectId: string) =>
  request<{ run_id: string; summary: ProjectSummary }>(`/projects/${projectId}/summary`, {
    method: "POST",
  });

// --- Learning ---

const learning = (projectId: string) => `/projects/${projectId}/learning`;

export const getPathway = (projectId: string) => request<Pathway>(`${learning(projectId)}/pathway`);

export const getExplanation = (projectId: string, key: string) =>
  request<Explanation>(`${learning(projectId)}/concepts/${encodeURIComponent(key)}/explanation`);

export const generateExplanation = (projectId: string, key: string) =>
  request<Explanation>(`${learning(projectId)}/concepts/${encodeURIComponent(key)}/explanation`, { method: "POST" });

export const startPractice = (projectId: string, mode: PracticeMode, count: number, conceptKey?: string) =>
  request<PracticeSession>(`${learning(projectId)}/practice`, json("POST", { mode, count, concept_key: conceptKey ?? null }));

export const answerQuestion = (projectId: string, sessionId: string, index: number, answer: string) =>
  request<GradeResult>(`${learning(projectId)}/practice/${sessionId}/answer`, json("POST", { index, answer }));

export const getProgress = (projectId: string) => request<Progress>(`${learning(projectId)}/progress`);

export const getPresentation = (projectId: string) => request<Presentation>(`${learning(projectId)}/presentation`);

export const generatePresentation = (projectId: string, minutes: number) =>
  request<Presentation>(`${learning(projectId)}/presentation`, json("POST", { minutes }));
