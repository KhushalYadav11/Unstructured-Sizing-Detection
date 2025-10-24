import type { Project, Measurement, InsertProject, InsertMeasurement } from "@shared/schema";

const API_BASE = "/api";
const TIMEOUT = 30000; // 30 seconds

async function fetchWithTimeout(
  input: RequestInfo,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT);
  
  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal
    });
    if (!response.ok) {
      throw await APIError.fromResponse(response);
    }
    return response;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new APIError("Request timeout", 408);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

// Projects
export async function getProjects(): Promise<Project[]> {
  const response = await fetchWithTimeout(`${API_BASE}/projects`);
  return response.json();
}

export async function getProject(id: string): Promise<Project> {
  const response = await fetch(`${API_BASE}/projects/${id}`);
  if (!response.ok) throw new Error("Failed to fetch project");
  return response.json();
}

export interface CreateProjectWithFiles {
  name: string;
  files?: File[];
}

export async function createProject(data: InsertProject): Promise<Project> {
  const response = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create project");
  return response.json();
}

export async function updateProject(id: string, data: Partial<InsertProject>): Promise<Project> {
  const response = await fetch(`${API_BASE}/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update project");
  return response.json();
}

export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/projects/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete project");
}

export async function getProjectStats(id: string): Promise<{
  totalMeasurements: number;
  totalVolume: number;
  totalWeight: number;
  averageQuality: string;
}> {
  const response = await fetch(`${API_BASE}/projects/${id}/stats`);
  if (!response.ok) throw new Error("Failed to fetch project stats");
  return response.json();
}

// Measurements
export async function getMeasurements(projectId: string): Promise<Measurement[]> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/measurements`);
  if (!response.ok) throw new Error("Failed to fetch measurements");
  return response.json();
}

export async function createMeasurement(data: InsertMeasurement): Promise<Measurement> {
  const response = await fetch(`${API_BASE}/measurements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create measurement");
  return response.json();
}

export async function calculate(data: {
  length: number;
  width: number;
  height: number;
  coalType: string;
  volumeMethod: string;
}): Promise<{
  volume: number;
  weight: number;
  quality: string;
  coalDensity: number;
  accuracy: number;
}> {
  const response = await fetch(`${API_BASE}/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to calculate");
  return response.json();
}

// Analytics
export async function getTodayCount(): Promise<{ count: number }> {
  const response = await fetch(`${API_BASE}/analytics/today`);
  if (!response.ok) throw new Error("Failed to fetch today count");
  return response.json();
}

export async function getAnalyticsOverview(): Promise<{
  totalMeasurements: number;
  totalVolume: number;
  totalWeight: number;
  qualityCount: Record<string, number>;
  coalTypeCount: Record<string, number>;
}> {
  const response = await fetch(`${API_BASE}/analytics/overview`);
  if (!response.ok) throw new Error("Failed to fetch analytics overview");
  return response.json();
}
