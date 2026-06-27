import { storage } from "./storage";
import { jobQueue, type JobQueueItem, type JobResult } from "./queue";
import { eventBroadcaster } from "./events";
import { meshProcessor } from "./mesh-processor";
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

// Reference model directory — overwrite final output with this when user answers Y
const REFERENCE_MODEL_DIR =
  process.env.REFERENCE_MODEL_DIR ||
  "C:\\Users\\KHUSHAL\\Downloads\\ImageToStl.com_8_5_2026";

class PhotogrammetryWorker {
  // Tracks which jobs should have their output replaced with the reference model
  private referenceOverrideJobs = new Set<string>();

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
    // Coal pile-specific settings optimised for images WITHOUT GPS data.
    // Key changes vs default:
    //   - use-3dmesh: skip the 2.5D DSM path that fails without GPS scale
    //   - dsm/dtm: false — these require geo-referenced coordinates
    //   - pc-geometric: true — improves point cloud quality without GPS
    //   - matcher-type: flann — more robust for unordered handheld photos
    //   - optimize-disk-space: saves space during processing
    //   - cuda-device 0: use RTX 4060 GPU for depth map estimation (requires --gpus all)
    const odmTaskUuid = await createOdmTask(
      validPaths,
      {
        dsm: false,
        dtm: false,
        featureQuality: (process.env.NODE_ODM_FEATURE_QUALITY as any) || "high",
        pcQuality: (process.env.NODE_ODM_PC_QUALITY as any) || "high",
        meshSize: parseInt(process.env.NODE_ODM_MESH_SIZE || "300000"),
        minNumFeatures: parseInt(process.env.NODE_ODM_MIN_NUM_FEATURES || "10000"),
        matcherNeighbors: parseInt(process.env.NODE_ODM_MATCHER_NEIGHBORS || "0"),
        texturingDataTerm: "area",
        texturingNaiveBayes: true,
        meshOctreeDepth: parseInt(process.env.NODE_ODM_MESH_OCTREE_DEPTH || "11"),
        useOpensfm: true,
        use3dmesh: true,
        ignoreGSD: true,
        pcGeometric: true,
        optimizeIntrinsics: true,
        gpsAccuracy: 10,
        depthMapsMethod: "sgm",
        pcFiltering: 1,
        orthophotoResolution: 2,
        cudaDevice: parseInt(process.env.NODE_ODM_CUDA_DEVICE || "0"),
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
    // More granular step labels derived from progress ranges
    const getStepLabel = (statusCode: number, progress: number): string => {
      if (statusCode === 10) return "queued";
      if (statusCode === 40) return "completed";
      if (statusCode === 30) return "failed";
      if (statusCode === 50) return "cancelled";
      // Map progress ranges to meaningful pipeline stage names
      if (progress < 10) return "detecting_features";
      if (progress < 20) return "matching_features";
      if (progress < 35) return "reconstructing_sparse_cloud";
      if (progress < 50) return "building_dense_cloud";
      if (progress < 65) return "filtering_point_cloud";
      if (progress < 80) return "building_mesh";
      if (progress < 90) return "texturing_model";
      if (progress < 95) return "generating_dsm";
      return "finalising";
    };

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const info = await getOdmTaskInfo(odmTaskUuid);
      const statusCode = info.status?.code;
      const progress = Math.round(info.progress ?? 0);
      const stepLabel = getStepLabel(statusCode, progress);

      console.log(`[worker] ODM task ${odmTaskUuid}: status=${statusCode}, progress=${progress}%`);

      // Broadcast progress to frontend
      await storage.updateProjectReconstruction(projectId, {
        progress,
        currentStep: stepLabel,
      });
      eventBroadcaster.broadcast(projectId, {
        type: "reconstruction.status_changed",
        data: {
          status: "processing",
          progress,
          currentStep: stepLabel,
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
            try { if (src !== dest) fs.copyFileSync(src, dest); } catch {}

            // Also copy the matching MTL file if it exists
            const mtlSrc = src.replace(/\.obj$/i, ".mtl");
            const mtlDest = path.join(reconDir, basename.replace(/\.obj$/i, ".mtl"));
            if (fs.existsSync(mtlSrc)) {
              try { if (mtlSrc !== mtlDest) fs.copyFileSync(mtlSrc, mtlDest); } catch {}
            }

            // Copy texture images referenced by the MTL (same directory as OBJ)
            const objDir = path.dirname(src);
            try {
              const objDirFiles = fs.readdirSync(objDir);
              const textureExts = [".jpg", ".jpeg", ".png", ".tif", ".tiff"];
              const textures: any[] = [];
              for (const f of objDirFiles) {
                if (textureExts.includes(path.extname(f).toLowerCase())) {
                  const tSrc = path.join(objDir, f);
                  const tDest = path.join(reconDir, f);
                  try { if (tSrc !== tDest) fs.copyFileSync(tSrc, tDest); } catch {}
                  textures.push({
                    name: f,
                    url: `/uploads/projects/${job.projectId}/reconstruction/${f}`,
                  });
                }
              }
              if (textures.length > 0) a.textures = textures;
            } catch {}

            a.mesh = {
              format: result.artifacts!.mesh.format,
              url: `/uploads/projects/${job.projectId}/reconstruction/${basename}`,
              sizeBytes: fs.existsSync(dest) ? fs.statSync(dest).size : undefined,
            };

            // Also copy the GLB if it exists alongside the OBJ — GLB embeds
            // textures so the browser viewer can display them without needing
            // separate MTL + PNG files
            const glbSrc = src.replace(/\.obj$/i, ".glb");
            if (fs.existsSync(glbSrc)) {
              const glbBasename = basename.replace(/\.obj$/i, ".glb");
              const glbDest = path.join(reconDir, glbBasename);
              try { if (glbSrc !== glbDest) fs.copyFileSync(glbSrc, glbDest); } catch {}
              a.meshGlb = {
                url: `/uploads/projects/${job.projectId}/reconstruction/${glbBasename}`,
                sizeBytes: fs.existsSync(glbDest) ? fs.statSync(glbDest).size : undefined,
              };
            }
          }

          if (result.artifacts!.pointCloud) {
            const src = result.artifacts!.pointCloud.localPath;
            const basename = path.basename(src);
            const dest = path.join(reconDir, basename);
            try { if (src !== dest) fs.copyFileSync(src, dest); } catch {}
            a.pointCloud = {
              format: result.artifacts!.pointCloud.format,
              url: `/uploads/projects/${job.projectId}/reconstruction/${basename}`,
              sizeBytes: fs.existsSync(dest) ? fs.statSync(dest).size : undefined,
            };
          }

          // Copy orthophoto for use as thumbnail
          const outputDir = path.join(uploadsRoot, "projects", job.projectId, "reconstruction", "odm_output");
          const orthoCandidates = [
            path.join(outputDir, "odm_orthophoto", "odm_orthophoto.tif"),
            path.join(outputDir, "odm_orthophoto", "odm_orthophoto.png"),
          ];
          for (const orthSrc of orthoCandidates) {
            if (fs.existsSync(orthSrc)) {
              const orthoExt = path.extname(orthSrc);
              const orthoDest = path.join(reconDir, `orthophoto${orthoExt}`);
              try { if (orthSrc !== orthoDest) fs.copyFileSync(orthSrc, orthoDest); } catch {}
              a.orthophoto = {
                url: `/uploads/projects/${job.projectId}/reconstruction/orthophoto${orthoExt}`,
              };
              break;
            }
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

    // ── Compute dimensions and write them back to the project ────────────
    // This is what makes completed reconstructions show up properly in
    // the Projects page with real L/W/H, volume, and weight values.
    if (artifacts?.mesh?.url) {
      try {
        const meshAbsPath = path.join(process.cwd(), artifacts.mesh.url);
        if (fs.existsSync(meshAbsPath)) {
          const meshResult = await meshProcessor.processObjFile(meshAbsPath, "bituminous");
          await storage.updateProject(job.projectId, {
            status: "completed",
            length: meshResult.dimensions.length,
            width: meshResult.dimensions.width,
            height: meshResult.dimensions.height,
            volume: meshResult.volume,
            weight: meshResult.weight,
            meshFileName: path.basename(artifacts.mesh.url),
            meshFilePath: meshAbsPath,
          });
          console.log(
            `[worker] Project ${job.projectId} updated: ` +
            `L=${meshResult.dimensions.length.toFixed(2)}m ` +
            `W=${meshResult.dimensions.width.toFixed(2)}m ` +
            `H=${meshResult.dimensions.height.toFixed(2)}m ` +
            `V=${meshResult.volume.toFixed(3)}m³`
          );
        }
      } catch (err) {
        // Non-fatal — project dimensions stay null, user can still see the model
        console.warn(`[worker] Failed to compute project dimensions for ${job.projectId}:`, err);
      }
    }
    // ────────────────────────────────────────────────────────────────────

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

    // ── Reference model override ─────────────────────────────────────────
    // If the user answered Y at the terminal prompt, now that ODM is done
    // and the original model is saved, overwrite the viewer artifacts with
    // the reference model files so the browser shows the reference instead.
    if (this.referenceOverrideJobs.has(jobId)) {
      this.referenceOverrideJobs.delete(jobId);
      console.log(`[worker] Applying reference model override for job ${jobId}`);
      try {
        await this.overwriteWithReferenceModel(job.projectId, jobId, REFERENCE_MODEL_DIR);
      } catch (err) {
        console.warn("[worker] Reference model override failed:", err);
      }
    }
    // ────────────────────────────────────────────────────────────────────
  }

  /**
   * Overwrites the project's reconstruction artifacts with files from refDir.
   * Called AFTER ODM completes so the original reconstruction still runs
   * (for progress tracking, etc.) but the viewer shows the reference model.
   */
  private async overwriteWithReferenceModel(
    projectId: string,
    jobId: string,
    refDir: string
  ): Promise<void> {
    if (!fs.existsSync(refDir)) {
      throw new Error(`Reference directory not found: ${refDir}`);
    }

    const uploadsRoot = path.join(process.cwd(), "uploads");
    const reconDir = path.join(uploadsRoot, "projects", projectId, "reconstruction");
    if (!fs.existsSync(reconDir)) fs.mkdirSync(reconDir, { recursive: true });

    // Copy all supported files from the reference directory
    const supportedExts = new Set([".obj", ".mtl", ".glb", ".jpg", ".jpeg", ".png", ".tif", ".tiff"]);
    const refFiles = fs.readdirSync(refDir);
    for (const fname of refFiles) {
      if (!supportedExts.has(path.extname(fname).toLowerCase())) continue;
      try {
        fs.copyFileSync(path.join(refDir, fname), path.join(reconDir, fname));
      } catch (e) {
        console.warn(`[worker] Could not copy reference file ${fname}:`, e);
      }
    }

    // Find the primary mesh files
    const objFile = refFiles.find(f => f.toLowerCase().endsWith(".obj"));
    const glbFile = refFiles.find(f => f.toLowerCase().endsWith(".glb"));
    const textureExts = new Set([".jpg", ".jpeg", ".png"]);
    const textures = refFiles
      .filter(f => textureExts.has(path.extname(f).toLowerCase()))
      .map(f => ({ name: f, url: `/uploads/projects/${projectId}/reconstruction/${f}` }));

    if (!objFile) {
      throw new Error(`No .obj file found in reference directory: ${refDir}`);
    }

    const objAbsPath = path.join(reconDir, objFile);

    // Build updated artifacts pointing at the reference files
    const newArtifacts: any = {
      mesh: {
        format: "obj",
        url: `/uploads/projects/${projectId}/reconstruction/${objFile}`,
        sizeBytes: fs.statSync(objAbsPath).size,
      },
    };
    if (glbFile) {
      const glbAbsPath = path.join(reconDir, glbFile);
      newArtifacts.meshGlb = {
        url: `/uploads/projects/${projectId}/reconstruction/${glbFile}`,
        sizeBytes: fs.existsSync(glbAbsPath) ? fs.statSync(glbAbsPath).size : undefined,
      };
    }
    if (textures.length > 0) newArtifacts.textures = textures;

    // Update storage so the viewer picks up the reference model URL
    await storage.updateProjectReconstruction(projectId, {
      status: "ready",
      progress: 100,
      currentStep: "completed",
      artifacts: newArtifacts,
    });

    // Recompute dimensions from the reference OBJ
    try {
      const meshResult = await meshProcessor.processObjFile(objAbsPath, "bituminous");
      await storage.updateProject(projectId, {
        status: "completed",
        length: meshResult.dimensions.length,
        width: meshResult.dimensions.width,
        height: meshResult.dimensions.height,
        volume: meshResult.volume,
        weight: meshResult.weight,
        meshFileName: objFile,
        meshFilePath: objAbsPath,
      });
      console.log(
        `[worker] Reference model applied — ` +
        `L=${meshResult.dimensions.length.toFixed(2)}m ` +
        `W=${meshResult.dimensions.width.toFixed(2)}m ` +
        `H=${meshResult.dimensions.height.toFixed(2)}m`
      );
    } catch (e) {
      console.warn("[worker] Could not compute reference model dimensions:", e);
    }

    // Broadcast so the frontend polling picks up the new artifacts immediately
    eventBroadcaster.broadcast(projectId, {
      type: "reconstruction.ready",
      data: {
        artifacts: {
          meshUrl: newArtifacts.mesh.url,
          textures: textures.map((t: any) => t.url),
        },
      },
    });

    console.log(`[worker] Reference model override complete for project ${projectId}`);
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

    // ── Y/N prompt ────────────────────────────────────────────────────────
    // Ask in the terminal right when the user hits Start Reconstruction.
    // Y → run ODM normally but swap the final displayed model with the
    //     reference model once ODM completes.
    // N → run ODM and show the actual ODM output.
    // Auto-N after 30 s so unattended servers don't hang.
    const refObjPath = path.join(REFERENCE_MODEL_DIR, "8_5_2026.obj");
    const refExists = fs.existsSync(refObjPath);

    const useReference = await new Promise<boolean>((resolve) => {
      if (!refExists) {
        console.log(`[worker] Reference model not found at ${refObjPath} — skipping Y/N prompt.`);
        return resolve(false);
      }
      process.stdout.write(
        `\n╔══════════════════════════════════════════════════════════╗\n` +
        `║  New reconstruction started — Job ${jobId.slice(0, 8)}…  ║\n` +
        `╠══════════════════════════════════════════════════════════╣\n` +
        `║  Override final model with reference?                    ║\n` +
        `║  Reference: ${path.basename(refObjPath).padEnd(44)}║\n` +
        `║                                                          ║\n` +
        `║  ODM will run normally. If you type Y, the model         ║\n` +
        `║  shown in the viewer will be replaced by the reference   ║\n` +
        `║  when reconstruction completes.                          ║\n` +
        `╠══════════════════════════════════════════════════════════╣\n` +
        `║  Type Y then Enter to override, N (or wait 30s) to skip  ║\n` +
        `╚══════════════════════════════════════════════════════════╝\n` +
        `> `
      );
      let buf = "";
      const onData = (chunk: Buffer) => {
        buf += chunk.toString();
        if (buf.includes("\n")) {
          process.stdin.removeListener("data", onData);
          process.stdin.pause();
          const answer = buf.trim().toUpperCase();
          if (answer.startsWith("Y")) {
            console.log("[worker] Reference model override ENABLED — ODM running, will swap at end.");
            resolve(true);
          } else {
            console.log("[worker] Proceeding with normal ODM output.");
            resolve(false);
          }
        }
      };
      process.stdin.resume();
      process.stdin.on("data", onData);
      setTimeout(() => {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        console.log("\n[worker] No input after 30s — proceeding with normal ODM output.");
        resolve(false);
      }, 30_000);
    });

    if (useReference) {
      this.referenceOverrideJobs.add(jobId);
    }
    // ─────────────────────────────────────────────────────────────────────

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
        savedPaths.push(src);
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
