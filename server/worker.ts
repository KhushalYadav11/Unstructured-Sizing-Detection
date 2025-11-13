import { storage } from "./storage";
import { jobQueue, type JobQueueItem, type JobResult } from "./queue";
import { eventBroadcaster } from "./events";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import * as glob from "glob";

// Mock photogrammetry processing
class PhotogrammetryWorker {
  constructor() {
    this.setupQueueHandlers();
  }

  private setupQueueHandlers(): void {
    jobQueue.on("job:started", (item: JobQueueItem) => {
      this.processJob(item);
    });
  }

  private async processJob(item: JobQueueItem): Promise<void> {
    const { jobId, projectId, photoIds, attempt } = item;

    try {
      console.log(`Starting photogrammetry job ${jobId} for project ${projectId} (attempt ${attempt})`);

      // Update job status to processing
      await storage.updatePhotogrammetryJob(jobId, {
        status: "processing",
        startedAt: new Date(),
      });

      // Broadcast status change
      eventBroadcaster.broadcast(projectId, {
        type: "reconstruction.status_changed",
        data: { status: "processing", progress: 10 },
      });

      // Simulate processing steps with progress updates
      await this.simulateProcessing(projectId, jobId);

      // Generate mock artifacts
      const artifacts = await this.generateMockArtifacts(projectId, jobId);

      // Complete the job
      const result: JobResult = {
        success: true,
        artifacts,
        metrics: {
          runtimeMs: 30000 + Math.random() * 60000, // 30-90 seconds
          avgCpu: 70 + Math.random() * 20,
          maxMemoryMb: 2048 + Math.random() * 2048,
        },
      };

      await this.completeJob(jobId, result);

    } catch (error) {
      console.error(`Job ${jobId} failed:`, error);
      await this.failJob(jobId, {
        code: "processing_error",
        message: error instanceof Error ? error.message : "Unknown processing error",
      });
    }
  }

  private async simulateProcessing(projectId: string, jobId: string): Promise<void> {
    const steps = [
      { step: "feature_detection", progress: 20, duration: 2000 },
      { step: "feature_matching", progress: 40, duration: 3000 },
      { step: "sparse_reconstruction", progress: 60, duration: 4000 },
      { step: "dense_reconstruction", progress: 80, duration: 5000 },
      { step: "texturing", progress: 95, duration: 3000 },
    ];

    for (const { step, progress, duration } of steps) {
      await new Promise(resolve => setTimeout(resolve, duration));

      // Update reconstruction state
      await storage.updateProjectReconstruction(projectId, {
        progress,
        currentStep: step,
      });

      // Broadcast progress update
      eventBroadcaster.broadcast(projectId, {
        type: "reconstruction.status_changed",
        data: { status: "processing", progress, currentStep: step },
      });
    }
  }

  private async generateMockArtifacts(projectId: string, jobId: string): Promise<JobResult["artifacts"]> {
    const uploadsDir = path.join(process.cwd(), "uploads");
    const projectDir = path.join(uploadsDir, "projects", projectId, "reconstruction");

    // Ensure directory exists
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // Generate mock OBJ mesh
    const meshPath = path.join(projectDir, "mesh.obj");
    const mockObjContent = `# Mock photogrammetry mesh for project ${projectId}
# Generated at ${new Date().toISOString()}

v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.5 1.0 0.0
v 0.5 0.5 1.0

f 1 2 3
f 1 2 4
f 1 3 4
f 2 3 4
`;
    fs.writeFileSync(meshPath, mockObjContent);

    // Generate mock point cloud
    const pointCloudPath = path.join(projectDir, "cloud.ply");
    const mockPlyContent = `ply
format ascii 1.0
element vertex 4
property float x
property float y
property float z
end_header
0.0 0.0 0.0
1.0 0.0 0.0
0.5 1.0 0.0
0.5 0.5 1.0
`;
    fs.writeFileSync(pointCloudPath, mockPlyContent);

    // Generate mock texture
    const texturePath = path.join(projectDir, "albedo.jpg");
    // Create a minimal 1x1 pixel JPEG (this is just a placeholder)
    const minimalJpeg = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x11,
      0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01,
      0x03, 0x11, 0x01, 0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x08, 0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF,
      0xDA, 0x00, 0x0C, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F,
      0x00, 0x00, 0xFF, 0xD9
    ]);
    fs.writeFileSync(texturePath, minimalJpeg);

    // Generate mock logs
    const logsPath = path.join(projectDir, "logs", "latest.log");
    const logsDir = path.dirname(logsPath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const mockLogs = `[${new Date().toISOString()}] Photogrammetry processing started
[${new Date().toISOString()}] Feature detection completed
[${new Date().toISOString()}] Sparse reconstruction completed
[${new Date().toISOString()}] Dense reconstruction completed
[${new Date().toISOString()}] Texturing completed
[${new Date().toISOString()}] Processing finished successfully
`;
    fs.writeFileSync(logsPath, mockLogs);

    return {
      mesh: { format: "obj", localPath: meshPath },
      pointCloud: { format: "ply", localPath: pointCloudPath },
      textures: [{ name: "albedo.jpg", localPath: texturePath }],
    };
  }

  private async completeJob(jobId: string, result: JobResult): Promise<void> {
    const job = await storage.getPhotogrammetryJob(jobId);
    if (!job) {
      console.error(`Job ${jobId} not found during completion`);
      return;
    }

    // Ensure reconstruction dir exists and copy artifacts there with stable URLs
    const uploadsRoot = path.join(process.cwd(), "uploads");
    const reconDir = path.join(uploadsRoot, "projects", job.projectId, "reconstruction");
    if (!fs.existsSync(reconDir)) fs.mkdirSync(reconDir, { recursive: true });

    // Build artifacts and copy files into reconstruction folder
    const artifacts = result.artifacts ? (() => {
      const a: any = {};
      if (result.artifacts.mesh) {
        const src = result.artifacts.mesh.localPath;
        const basename = path.basename(src);
        const dest = path.join(reconDir, basename);
        try { if (src !== dest) fs.copyFileSync(src, dest); } catch (e) { /* best-effort */ }
        a.mesh = {
          format: result.artifacts.mesh.format,
          url: `/uploads/projects/${job.projectId}/reconstruction/${basename}`,
          sizeBytes: fs.existsSync(dest) ? fs.statSync(dest).size : undefined,
        };
      }
      if (result.artifacts.pointCloud) {
        const src = result.artifacts.pointCloud.localPath;
        const basename = path.basename(src);
        const dest = path.join(reconDir, basename);
        try { if (src !== dest) fs.copyFileSync(src, dest); } catch (e) { /* best-effort */ }
        a.pointCloud = {
          format: result.artifacts.pointCloud.format,
          url: `/uploads/projects/${job.projectId}/reconstruction/${basename}`,
          sizeBytes: fs.existsSync(dest) ? fs.statSync(dest).size : undefined,
        };
      }
      if (result.artifacts.textures) {
        a.textures = result.artifacts.textures.map((tex) => {
          const src = tex.localPath;
          const basename = tex.name || path.basename(src);
          const dest = path.join(reconDir, basename);
          try { if (src !== dest) fs.copyFileSync(src, dest); } catch (e) { /* best-effort */ }
          return {
            name: basename,
            url: `/uploads/projects/${job.projectId}/reconstruction/${basename}`,
            sizeBytes: fs.existsSync(dest) ? fs.statSync(dest).size : undefined,
          };
        });
      }
      return a;
    })() : null;

    // Update job record
    await storage.updatePhotogrammetryJob(jobId, {
      status: "succeeded",
      finishedAt: new Date(),
      engine: "mock-photogrammetry-v1.0",
      metrics: result.metrics,
      logs: {
        previewUrl: `/uploads/projects/${job.projectId}/logs/latest.log`,
        downloadUrl: `/uploads/projects/${job.projectId}/logs/latest.log`,
      },
    });

    await storage.updateProjectReconstruction(job.projectId, {
      status: "ready",
      progress: 100,
      currentStep: "completed",
      artifacts,
    });

    // Broadcast completion
    eventBroadcaster.broadcast(job.projectId, {
      type: "reconstruction.ready",
      data: {
        artifacts: {
          meshUrl: artifacts?.mesh?.url,
          textures: artifacts?.textures?.map((t: any) => t.url) || [],
        },
      },
    });

    // Mark queue job as complete
    jobQueue.completeJob(jobId, result);
  }

  private async failJob(jobId: string, error: { code: string; message: string }): Promise<void> {
    const job = await storage.getPhotogrammetryJob(jobId);
    if (!job) {
      console.error(`Job ${jobId} not found during failure`);
      return;
    }

    // Update job record
    await storage.updatePhotogrammetryJob(jobId, {
      status: "failed",
      finishedAt: new Date(),
      failure: {
        code: error.code as any,
        message: error.message,
      },
    });

    // Update project reconstruction state
    await storage.updateProjectReconstruction(job.projectId, {
      status: "failed",
      failureReason: {
        code: error.code as any,
        message: error.message,
      },
    });

    // Broadcast failure
    eventBroadcaster.broadcast(job.projectId, {
      type: "reconstruction.failed",
      data: { failureReason: error.message },
    });

    // Mark queue job as failed
    jobQueue.failJob(jobId, error);
  }

  // Method to start processing a photogrammetry job
  async startPhotogrammetryJob(projectId: string, photoIds: string[]): Promise<void> {
    const job = await storage.createPhotogrammetryJob({
      projectId,
      status: "queued",
    });

    const queueItem: JobQueueItem = {
      jobId: job.id,
      projectId,
      photoIds,
      attempt: 1,
    };

    jobQueue.enqueue(queueItem);
  }

  // New: run Meshroom CLI for a given project input dir and output dir
  private runMeshroom(inputDir: string, outputDir: string, logsPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use env override if provided; fallback to the provided Windows Meshroom.exe path.
      // You can set process.env.MESHROOM_CLI to e.g. "meshroom_batch" on Linux.
      const meshroomCli = process.env.MESHROOM_CLI || "D:\\Meshroom-2025.1.0-Windows\\Meshroom-2025.1.0\\Meshroom.exe";
      // Ensure output dir exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      // Ensure logs parent exists
      const logsDir = path.dirname(logsPath);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      const outStream = fs.createWriteStream(logsPath, { flags: "a" });

      // Build a single shell-safe command string using JSON.stringify for safe quoting.
      // Note: JSON.stringify returns a quoted string; strip surrounding quotes when not desired
      const q = (s: string) => JSON.stringify(s);
      const cmd = `${q(meshroomCli)} --input ${q(inputDir)} --output ${q(outputDir)}`;
      console.log(`Starting Meshroom: ${cmd}`);
      const proc = spawn(cmd, { stdio: ["ignore", "pipe", "pipe"], shell: true });

      proc.stdout.on("data", (chunk) => {
        outStream.write(`[stdout] ${chunk.toString()}`);
      });
      proc.stderr.on("data", (chunk) => {
        outStream.write(`[stderr] ${chunk.toString()}`);
      });

      proc.on("error", (err) => {
        outStream.end();
        reject(err);
      });

      proc.on("close", (code) => {
        outStream.end();
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Meshroom exited with code ${code}`));
        }
      });
    });
  }

  // New: utility to find the generated model file (.obj or .fbx) under output dir
  private async findGeneratedModel(outputDir: string): Promise<string | null> {
    try {
      // Use sync glob to avoid callback/typing differences across versions
      const files = glob.sync("**/*.+(obj|fbx)", { cwd: outputDir, nodir: true, absolute: true });
      if (!files || files.length === 0) return null;
      // choose largest
      let chosen = files[0];
      let maxSize = 0;
      try {
        maxSize = fs.statSync(chosen).size;
      } catch {
        maxSize = 0;
      }
      for (const f of files) {
        try {
          const s = fs.statSync(f).size;
          if (s > maxSize) {
            maxSize = s;
            chosen = f;
          }
        } catch {}
      }
      return chosen;
    } catch {
      return null;
    }
  }

  // New: public method to start a Meshroom job from uploaded images
  // Returns the created jobId and runs Meshroom in background (non-blocking)
  async startMeshroomJob(projectId: string, imagePaths: string[]): Promise<string> {
    // Create job record
    const job = await storage.createPhotogrammetryJob({
      projectId,
      status: "queued",
    });

    const jobId = job.id;

    // Ensure project upload image dir exists
    const uploadsDir = path.join(process.cwd(), "uploads");
    const projectImagesDir = path.join(uploadsDir, "projects", projectId, "images");
    if (!fs.existsSync(projectImagesDir)) {
      fs.mkdirSync(projectImagesDir, { recursive: true });
    }

    // If provided imagePaths are temporary locations, copy them under projectImagesDir
    const savedPaths: string[] = [];
    for (const src of imagePaths) {
      const base = path.basename(src);
      const dest = path.join(projectImagesDir, base);
      if (src !== dest) {
        try {
          fs.copyFileSync(src, dest);
        } catch (e) {
          // best-effort: if copy fails, skip
        }
      }
      savedPaths.push(dest);
    }

    // Update job to processing (status visible immediately)
    await storage.updatePhotogrammetryJob(jobId, {
      status: "processing",
      startedAt: new Date(),
      attempt: (job.attempt || 1),
    });

    // Broadcast status
    eventBroadcaster.broadcast(projectId, {
      type: "reconstruction.status_changed",
      data: { status: "processing", progress: 5 },
    });

    // Prepare output dirs and logs
    const outputDir = path.join(uploadsDir, "projects", projectId, "reconstruction", "meshroom_output");
    const logsPath = path.join(uploadsDir, "projects", projectId, "reconstruction", "logs", "meshroom.log");

    // Run Meshroom in background
    (async () => {
      try {
        await this.runMeshroom(projectImagesDir, outputDir, logsPath);

        // Find model file
        const modelPath = await this.findGeneratedModel(outputDir);

        if (!modelPath) {
          throw new Error("No model file (.obj/.fbx) found in Meshroom output");
        }

        // Build artifacts structure
        const artifacts: JobResult["artifacts"] = {
          mesh: { format: path.extname(modelPath).replace(".", ""), localPath: modelPath },
          pointCloud: undefined,
          textures: [],
        };

        const result: JobResult = {
          success: true,
          artifacts,
          metrics: {
            runtimeMs: 0,
            avgCpu: 0,
            maxMemoryMb: 0,
          },
        };

        await this.completeJob(jobId, result);
      } catch (err) {
        console.error(`Meshroom job ${jobId} failed:`, err);
        await this.failJob(jobId, {
          code: "meshroom_failed",
          message: err instanceof Error ? err.message : "Meshroom processing failed",
        });
      }
    })().catch((err) => {
      // Ensure background errors are logged
      console.error("Unhandled error in background Meshroom run:", err);
    });

    // Return jobId immediately so API can respond without waiting for Meshroom
    return jobId;
  }
}

export const photogrammetryWorker = new PhotogrammetryWorker();