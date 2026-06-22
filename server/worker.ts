import { storage } from "./storage";
import { jobQueue, type JobQueueItem, type JobResult } from "./queue";
import { eventBroadcaster } from "./events";
import fs from "fs";
import path from "path";
import {
  checkNodeOdmHealth,
  createOdmTask,
  getOdmTaskInfo,
  downloadOdmOutput,
  ODM_STATUS,
} from "./nodeodm-client";

// How often to poll NodeODM for progress (ms)
const POLL_INTERVAL_MS = 3000;

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
      console.log(`[worker] Starting job ${jobId} for project ${projectId} (attempt ${attempt})`);
      await storage.updatePhotogrammetryJob(jobId, {
        status: "processing",
        startedAt: new Date(),
      });
      eventBroadcaster.broadcast(projectId, {
        type: "reconstruction.status_changed",
        data: { status: "processing", progress: 5 },
      });

      // photoIds here are file paths stored during upload
      await this.runNodeOdmJob(projectId, jobId, photoIds);
    } catch (error) {
      console.error(`[worker] Job ${jobId} failed:`, error);
      await this.failJob(jobId, {
        code: "processing_error",
        message: error instanceof Error ? error.message : "Unknown processing error",
      });
    }
  }

  /**
   * Main NodeODM integration.
   * Uploads images, polls for progress, downloads output, completes job.
   */
  private async runNodeOdmJob(
    projectId: string,
    jobId: string,
    imagePaths: string[]
  ): Promise<void> {
    const startedAt = Date.now();

    // 1. Health check
    const healthy = await checkNodeOdmHealth();
    if (!healthy) {
      throw new Error(
        "NodeODM is not reachable. Make sure it is running: docker run -p 3000:3000 opendronemap/nodeodm"
      );
    }

    // 2. Filter to existing image files
    const validPaths = imagePaths.filter((p) => fs.existsSync(p));
    if (validPaths.length === 0) {
      throw new Error("No valid image files found to process");
    }

    console.log(`[worker] Submitting ${validPaths.length} images to NodeODM`);

    // 3. Create NodeODM task and upload images
    const odmTaskUuid = await createOdmTask(
      validPaths,
      {
        dsm: true,          // Digital Surface Model — needed for volume
        dtm: false,
        featureQuality: (process.env.NODE_ODM_FEATURE_QUALITY as any) || "ultra",
        pcQuality: (process.env.NODE_ODM_PC_QUALITY as any) || "ultra",
        meshSize: parseInt(process.env.NODE_ODM_MESH_SIZE || "500000"),
        minNumFeatures: parseInt(process.env.NODE_ODM_MIN_NUM_FEATURES || "10000"),
        matcherNeighbors: parseInt(process.env.NODE_ODM_MATCHER_NEIGHBORS || "12"),
        texturingDataTerm: "area",     // Better texture mapping
        texturingNaiveBayes: true,     // Improved texture blending
        meshOctreeDepth: parseInt(process.env.NODE_ODM_MESH_OCTREE_DEPTH || "11"),
        useOpensfm: true,              // Use OpenSfM for better feature matching
      },
      `coal-project-${projectId}`
    );

    console.log(`[worker] NodeODM task created: ${odmTaskUuid}`);

    // Store the ODM task UUID in the job engine field for reference
    await storage.updatePhotogrammetryJob(jobId, {
      engine: `nodeodm:${odmTaskUuid}`,
    });

    // 4. Poll for completion
    await this.pollOdmTask(odmTaskUuid, projectId, jobId);

    // 5. Download output
    const uploadsDir = path.join(process.cwd(), "uploads");
    const outputDir = path.join(uploadsDir, "projects", projectId, "reconstruction", "odm_output");

    console.log(`[worker] Downloading NodeODM output for task ${odmTaskUuid}`);
    const { objPath } = await downloadOdmOutput(odmTaskUuid, outputDir);

    if (!objPath) {
      throw new Error("NodeODM completed but no mesh file (.obj/.ply) was found in output");
    }

    console.log(`[worker] Mesh found at: ${objPath}`);

    // 6. Build result
    const ext = path.extname(objPath).replace(".", "");
    const result: JobResult = {
      success: true,
      artifacts: {
        mesh: { format: ext, localPath: objPath },
      },
      metrics: {
        runtimeMs: Date.now() - startedAt,
      },
    };

    await this.completeJob(jobId, result);
  }

  /**
   * Poll NodeODM task until it completes, fails, or is cancelled.
   * Broadcasts progress updates to the client.
   */
  private async pollOdmTask(
    odmTaskUuid: string,
    projectId: string,
    jobId: string
  ): Promise<void> {
    const ODM_STEP_LABELS: Record<number, string> = {
      10: "queued",
      20: "processing",
      30: "failed",
      40: "completed",
      50: "cancelled",
    };

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const info = await getOdmTaskInfo(odmTaskUuid);
      const statusCode = info.status?.code;
      const progress = Math.round(info.progress ?? 0);

      console.log(`[worker] ODM task ${odmTaskUuid}: status=${statusCode}, progress=${progress}%`);

      // Broadcast progress to frontend
      await storage.updateProjectReconstruction(projectId, {
        progress,
        currentStep: ODM_STEP_LABELS[statusCode] ?? "processing",
      });
      eventBroadcaster.broadcast(projectId, {
        type: "reconstruction.status_changed",
        data: {
          status: "processing",
          progress,
          currentStep: ODM_STEP_LABELS[statusCode] ?? "processing",
        },
      });

      if (statusCode === ODM_STATUS.COMPLETED) {
        console.log(`[worker] ODM task ${odmTaskUuid} completed`);
        return;
      }

      if (statusCode === ODM_STATUS.FAILED) {
        throw new Error(`NodeODM processing failed for task ${odmTaskUuid}`);
      }

      if (statusCode === ODM_STATUS.CANCELLED) {
        throw new Error(`NodeODM task ${odmTaskUuid} was cancelled`);
      }
    }
  }

  private async completeJob(jobId: string, result: JobResult): Promise<void> {
    const job = await storage.getPhotogrammetryJob(jobId);
    if (!job) {
      console.error(`[worker] Job ${jobId} not found during completion`);
      return;
    }

    const uploadsRoot = path.join(process.cwd(), "uploads");
    const reconDir = path.join(uploadsRoot, "projects", job.projectId, "reconstruction");
    if (!fs.existsSync(reconDir)) fs.mkdirSync(reconDir, { recursive: true });

    // Copy artifacts to stable URL location
    const artifacts = result.artifacts
      ? (() => {
          const a: any = {};
          if (result.artifacts!.mesh) {
            const src = result.artifacts!.mesh.localPath;
            const basename = path.basename(src);
            const dest = path.join(reconDir, basename);
            try {
              if (src !== dest) fs.copyFileSync(src, dest);
            } catch {}
            a.mesh = {
              format: result.artifacts!.mesh.format,
              url: `/uploads/projects/${job.projectId}/reconstruction/${basename}`,
              sizeBytes: fs.existsSync(dest) ? fs.statSync(dest).size : undefined,
            };
          }
          if (result.artifacts!.pointCloud) {
            const src = result.artifacts!.pointCloud.localPath;
            const basename = path.basename(src);
            const dest = path.join(reconDir, basename);
            try {
              if (src !== dest) fs.copyFileSync(src, dest);
            } catch {}
            a.pointCloud = {
              format: result.artifacts!.pointCloud.format,
              url: `/uploads/projects/${job.projectId}/reconstruction/${basename}`,
              sizeBytes: fs.existsSync(dest) ? fs.statSync(dest).size : undefined,
            };
          }
          if (result.artifacts!.textures) {
            a.textures = result.artifacts!.textures.map((tex) => {
              const src = tex.localPath;
              const basename = tex.name || path.basename(src);
              const dest = path.join(reconDir, basename);
              try {
                if (src !== dest) fs.copyFileSync(src, dest);
              } catch {}
              return {
                name: basename,
                url: `/uploads/projects/${job.projectId}/reconstruction/${basename}`,
                sizeBytes: fs.existsSync(dest) ? fs.statSync(dest).size : undefined,
              };
            });
          }
          return a;
        })()
      : null;

    await storage.updatePhotogrammetryJob(jobId, {
      status: "succeeded",
      finishedAt: new Date(),
      metrics: result.metrics,
    });

    await storage.updateProjectReconstruction(job.projectId, {
      status: "ready",
      progress: 100,
      currentStep: "completed",
      artifacts,
    });

    eventBroadcaster.broadcast(job.projectId, {
      type: "reconstruction.ready",
      data: {
        artifacts: {
          meshUrl: artifacts?.mesh?.url,
          textures: artifacts?.textures?.map((t: any) => t.url) || [],
        },
      },
    });

    jobQueue.completeJob(jobId, result);
    console.log(`[worker] Job ${jobId} completed successfully`);
  }

  private async failJob(
    jobId: string,
    error: { code: string; message: string }
  ): Promise<void> {
    const job = await storage.getPhotogrammetryJob(jobId);
    if (!job) {
      console.error(`[worker] Job ${jobId} not found during failure`);
      return;
    }

    await storage.updatePhotogrammetryJob(jobId, {
      status: "failed",
      finishedAt: new Date(),
      failure: { code: error.code as any, message: error.message },
    });

    await storage.updateProjectReconstruction(job.projectId, {
      status: "failed",
      failureReason: { code: error.code as any, message: error.message },
    });

    eventBroadcaster.broadcast(job.projectId, {
      type: "reconstruction.failed",
      data: { failureReason: error.message },
    });

    jobQueue.failJob(jobId, error);
    console.error(`[worker] Job ${jobId} failed: ${error.message}`);
  }

  /**
   * Public entry point called by the /api/reconstruct route.
   * Creates a job record and kicks off NodeODM processing in the background.
   * Returns the jobId immediately so the API can respond.
   */
  async startMeshroomJob(projectId: string, imagePaths: string[]): Promise<string> {
    const job = await storage.createPhotogrammetryJob({
      projectId,
      status: "queued",
    });
    const jobId = job.id;

    // Copy uploaded images to a stable project directory
    const uploadsDir = path.join(process.cwd(), "uploads");
    const projectImagesDir = path.join(uploadsDir, "projects", projectId, "images");
    if (!fs.existsSync(projectImagesDir)) {
      fs.mkdirSync(projectImagesDir, { recursive: true });
    }

    const savedPaths: string[] = [];
    for (const src of imagePaths) {
      const dest = path.join(projectImagesDir, path.basename(src));
      try {
        if (src !== dest) fs.copyFileSync(src, dest);
        savedPaths.push(dest);
      } catch {
        savedPaths.push(src); // use original if copy fails
      }
    }

    await storage.updateProjectReconstruction(projectId, {
      status: "queued",
      latestJobId: jobId,
    });

    eventBroadcaster.broadcast(projectId, {
      type: "reconstruction.status_changed",
      data: { status: "queued", progress: 0 },
    });

    // Run in background — don't await
    (async () => {
      try {
        await storage.updatePhotogrammetryJob(jobId, {
          status: "processing",
          startedAt: new Date(),
        });
        eventBroadcaster.broadcast(projectId, {
          type: "reconstruction.status_changed",
          data: { status: "processing", progress: 5 },
        });
        await this.runNodeOdmJob(projectId, jobId, savedPaths);
      } catch (err) {
        await this.failJob(jobId, {
          code: "nodeodm_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })().catch((err) => {
      console.error("[worker] Unhandled background error:", err);
    });

    return jobId;
  }
}

export const photogrammetryWorker = new PhotogrammetryWorker();
