/**
 * NodeODM REST API Client
 *
 * NodeODM is the REST API layer for OpenDroneMap (ODM).
 * Run it locally with Docker:
 *   docker run -p 3000:3000 opendronemap/nodeodm
 *
 * API docs: https://github.com/OpenDroneMap/NodeODM/blob/master/docs/index.adoc
 */

import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import FormData from "form-data";

const NODE_ODM_URL = process.env.NODE_ODM_URL || "http://localhost:3000";

export interface OdmTaskOptions {
  featureQuality?: "ultra" | "high" | "medium" | "low" | "lowest";
  pcQuality?: "ultra" | "high" | "medium" | "low" | "lowest";
  meshSize?: number;
  dsm?: boolean;
  dtm?: boolean;
  orthophotoResolution?: number;
  minNumFeatures?: number;
  matcherNeighbors?: number;
  texturingDataTerm?: "gmi" | "area";
  texturingNaiveBayes?: boolean;
  meshOctreeDepth?: number;
  useOpensfm?: boolean;
}

export interface OdmTaskInfo {
  uuid: string;
  name: string;
  status: {
    code: number; // 10=queued, 20=running, 30=failed, 40=completed, 50=cancelled
  };
  progress: number;
  processingTime: number;
  dateCreated: number;
  dateStarted: number;
  imagesCount: number;
  options: Array<{ name: string; value: any }>;
}

export const ODM_STATUS = {
  QUEUED: 10,
  RUNNING: 20,
  FAILED: 30,
  COMPLETED: 40,
  CANCELLED: 50,
} as const;

/**
 * Submit a multipart form using Node's http module directly.
 * This avoids the native fetch / form-data stream incompatibility.
 */
function submitForm(url: string, form: FormData): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;

    const req = transport.request(
      {
        method: "POST",
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: form.getHeaders(),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, body });
          }
        });
      }
    );

    req.on("error", reject);
    form.pipe(req);
  });
}

/**
 * Check if NodeODM is reachable
 */
export async function checkNodeOdmHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${NODE_ODM_URL}/info`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Create a new task and upload images.
 * Returns the task UUID.
 */
export async function createOdmTask(
  imagePaths: string[],
  options: OdmTaskOptions = {},
  taskName?: string
): Promise<string> {
  const form = new FormData();

  let fileCount = 0;
  for (const imgPath of imagePaths) {
    if (fs.existsSync(imgPath)) {
      form.append("images", fs.createReadStream(imgPath), {
        filename: path.basename(imgPath),
        contentType: "image/jpeg",
      });
      fileCount++;
    }
  }

  if (fileCount === 0) {
    throw new Error("No valid image files found to upload to NodeODM");
  }

  const odmOptions: Array<{ name: string; value: any }> = [
    { name: "dsm", value: options.dsm ?? true },
    { name: "dtm", value: options.dtm ?? false },
    { name: "mesh-size", value: options.meshSize ?? 200000 },
    { name: "feature-quality", value: options.featureQuality ?? "medium" },
    { name: "pc-quality", value: options.pcQuality ?? "medium" },
    { name: "orthophoto-resolution", value: options.orthophotoResolution ?? 5 },
    { name: "min-num-features", value: options.minNumFeatures ?? 8000 },
    { name: "matcher-neighbors", value: options.matcherNeighbors ?? 8 },
  ];

  // Add optional advanced parameters if provided
  if (options.texturingDataTerm) {
    odmOptions.push({ name: "texturing-data-term", value: options.texturingDataTerm });
  }
  if (options.texturingNaiveBayes !== undefined) {
    odmOptions.push({ name: "texturing-naivebayes", value: options.texturingNaiveBayes });
  }
  if (options.meshOctreeDepth) {
    odmOptions.push({ name: "mesh-octree-depth", value: options.meshOctreeDepth });
  }
  if (options.useOpensfm !== undefined) {
    odmOptions.push({ name: "use-opensfm", value: options.useOpensfm });
  }

  form.append("options", JSON.stringify(odmOptions));
  if (taskName) form.append("name", taskName);

  console.log(`[nodeodm] Uploading ${fileCount} images to ${NODE_ODM_URL}/task/new`);

  const { status, body } = await submitForm(`${NODE_ODM_URL}/task/new`, form);

  if (status !== 200 && status !== 201) {
    throw new Error(`NodeODM task creation failed (${status}): ${JSON.stringify(body)}`);
  }

  if (typeof body === "object" && body.error) {
    throw new Error(`NodeODM error: ${body.error}`);
  }

  const uuid = typeof body === "object" ? body.uuid : null;
  if (!uuid) {
    throw new Error(`NodeODM did not return a task UUID. Response: ${JSON.stringify(body)}`);
  }

  return uuid;
}

/**
 * Get current task status and progress
 */
export async function getOdmTaskInfo(taskUuid: string): Promise<OdmTaskInfo> {
  const res = await fetch(`${NODE_ODM_URL}/task/${taskUuid}/info`);
  if (!res.ok) {
    throw new Error(`NodeODM task info failed (${res.status})`);
  }
  return res.json() as Promise<OdmTaskInfo>;
}

/**
 * Download task output as a zip and extract the OBJ mesh.
 * Returns the local path to the extracted OBJ file.
 */
export async function downloadOdmOutput(
  taskUuid: string,
  destDir: string
): Promise<{ objPath: string | null; allFilesDir: string }> {
  // Ensure destination exists
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const zipPath = path.join(destDir, "odm_output.zip");

  // Download the all.zip archive
  const res = await fetch(`${NODE_ODM_URL}/task/${taskUuid}/download/all.zip`);
  if (!res.ok) {
    throw new Error(`NodeODM download failed (${res.status})`);
  }

  // Stream to disk
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(zipPath, buffer);

  // Extract zip
  const { default: AdmZip } = await import("adm-zip");
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);

  // Clean up zip
  try { fs.unlinkSync(zipPath); } catch {}

  // Find the OBJ mesh — ODM puts it at odm_texturing/odm_textured_model_geo.obj
  // or odm_mesh/odm_mesh.ply as fallback
  const candidates = [
    path.join(destDir, "odm_texturing", "odm_textured_model_geo.obj"),
    path.join(destDir, "odm_texturing", "odm_textured_model.obj"),
    path.join(destDir, "odm_mesh", "odm_mesh.ply"),
  ];

  let objPath: string | null = null;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      objPath = candidate;
      break;
    }
  }

  // Fallback: search recursively for any .obj
  if (!objPath) {
    objPath = findFileRecursive(destDir, [".obj", ".ply"]);
  }

  return { objPath, allFilesDir: destDir };
}

/**
 * Cancel a running task
 */
export async function cancelOdmTask(taskUuid: string): Promise<void> {
  await fetch(`${NODE_ODM_URL}/task/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid: taskUuid }),
  });
}

/**
 * Delete a task and its data from NodeODM
 */
export async function deleteOdmTask(taskUuid: string): Promise<void> {
  await fetch(`${NODE_ODM_URL}/task/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid: taskUuid }),
  });
}

// Helper: recursively find first file with given extensions
function findFileRecursive(dir: string, extensions: string[]): string | null {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findFileRecursive(fullPath, extensions);
        if (found) return found;
      } else if (extensions.includes(path.extname(entry.name).toLowerCase())) {
        return fullPath;
      }
    }
  } catch {}
  return null;
}
