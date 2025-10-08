// API functions for 3D mesh processing

const API_BASE = "/api";

/**
 * Upload a 3D model file for processing
 */
export async function uploadMeshFile(file: File, projectId?: string): Promise<{
  fileId: string;
  filename: string;
  url: string;
}> {
  const formData = new FormData();
  formData.append('file', file);
  if (projectId) {
    formData.append('projectId', projectId);
  }

  const response = await fetch(`${API_BASE}/mesh/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to upload mesh file');
  }

  return response.json();
}

/**
 * Process an uploaded 3D model to calculate volume and other metrics
 */
export async function processMesh(fileId: string, options: {
  density?: number;
  coalType?: string;
  projectId?: string;
  name?: string;
}): Promise<{
  id: string;
  volume: number;
  weight: number;
  surfaceArea: number;
  quality: string;
  meshUrl: string;
  thumbnailUrl: string;
}> {
  const response = await fetch(`${API_BASE}/mesh/process/${fileId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to process mesh');
  }

  return response.json();
}

/**
 * Get a list of supported coal types and their default densities
 */
export async function getCoalTypes(): Promise<Array<{
  id: string;
  name: string;
  density: number;
}>> {
  const response = await fetch(`${API_BASE}/mesh/coal-types`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch coal types');
  }
  
  return response.json();
}

/**
 * Save a processed measurement to a project
 */
export async function saveMeasurement(measurementId: string, projectId: string): Promise<{
  id: string;
  createdAt: string;
}> {
  const response = await fetch(`${API_BASE}/mesh/measurements/${measurementId}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to save measurement');
  }

  return response.json();
}