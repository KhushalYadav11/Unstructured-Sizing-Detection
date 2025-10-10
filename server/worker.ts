import { storage } from "./storage";
import { jobQueue, type JobQueueItem, type JobResult } from "./queue";
import { eventBroadcaster } from "./events";
import { MemStorage } from "./storage";
import fs from "fs";
import path from "path";

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

    // Update project reconstruction state
    const artifacts = result.artifacts ? {
      mesh: result.artifacts.mesh ? {
        format: result.artifacts.mesh.format,
        url: `/uploads/projects/${job.projectId}/reconstruction/mesh.obj`,
        sizeBytes: fs.statSync(result.artifacts.mesh.localPath).size,
      } : undefined,
      pointCloud: result.artifacts.pointCloud ? {
        format: result.artifacts.pointCloud.format,
        url: `/uploads/projects/${job.projectId}/reconstruction/cloud.ply`,
      } : undefined,
      textures: result.artifacts.textures?.map(tex => ({
        name: tex.name,
        url: `/uploads/projects/${job.projectId}/reconstruction/${tex.name}`,
        sizeBytes: fs.statSync(tex.localPath).size,
      })),
    } : null;

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
          textures: artifacts?.textures?.map(t => t.url) || [],
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
}

export const photogrammetryWorker = new PhotogrammetryWorker();