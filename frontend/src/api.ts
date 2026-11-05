import type { AnalysisReport, Project, ProjectCreated, ProjectSummary } from "./types";

const BASE = "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);
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
  return (await response.json()) as T;
}

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
