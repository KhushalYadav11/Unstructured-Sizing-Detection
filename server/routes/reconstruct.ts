import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { photogrammetryWorker } from "../worker";
import { storage } from "../storage";
import { validateImages, formatValidationReport } from "../image-validator";
import { checkNodeOdmHealth } from "../nodeodm-client";

const router = express.Router();

// Temp upload dir (files will be copied into project folder by the worker)
const tempDir = path.join(process.cwd(), "tmp", "uploads");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const upload = multer({ dest: tempDir });

// ── System status endpoint ─────────────────────────────────────────────────
// Called by the UI on page load so it can show a setup banner early.
router.get("/api/system/status", async (_req, res) => {
  const nodeOdmUrl = process.env.NODE_ODM_URL || "http://localhost:3000";
  const nodeOdmHealthy = await checkNodeOdmHealth();
  res.json({
    nodeOdm: {
      url: nodeOdmUrl,
      healthy: nodeOdmHealthy,
      setupCommand: "docker run -d -p 3000:3000 opendronemap/nodeodm",
    },
  });
});

// Start reconstruction: accepts field "projectId" (optional) and many "images"
router.post("/api/reconstruct", upload.array("images", 200), async (req, res) => {
  try {
    const projectId = (req.body.projectId as string) || `p_${Date.now()}`;
    const files = (req.files as Express.Multer.File[]) || [];

    if (!files.length) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    // Check NodeODM availability BEFORE doing any work
    const nodeOdmHealthy = await checkNodeOdmHealth();
    if (!nodeOdmHealthy) {
      // Clean up uploaded temp files
      for (const f of files) {
        try { fs.unlinkSync(f.path); } catch {}
      }
      return res.status(503).json({
        error: "NodeODM is not available",
        details: "The 3D reconstruction engine (NodeODM) is not running.",
        setupCommand: "docker run -d -p 3000:3000 opendronemap/nodeodm",
        help: "Install Docker, then run the command above to start NodeODM. It will be available at http://localhost:3000.",
      });
    }

    const savedPaths = files.map(f => f.path);

    // Validate images before processing
    console.log(`[reconstruct] Validating ${savedPaths.length} images...`);
    const validation = await validateImages(savedPaths);
    
    if (!validation.valid) {
      const report = formatValidationReport(validation);
      console.error("[reconstruct] Image validation failed:\n" + report);
      return res.status(400).json({ 
        error: "Image validation failed", 
        details: validation.errors,
        warnings: validation.warnings,
        report 
      });
    }

    if (validation.warnings.length > 0) {
      console.warn("[reconstruct] Image validation warnings:\n" + formatValidationReport(validation));
    }

    // startMeshroomJob returns jobId immediately and runs NodeODM in background
    const jobId = await photogrammetryWorker.startMeshroomJob(projectId, savedPaths);

    return res.status(202).json({ 
      message: "Reconstruction started", 
      jobId, 
      projectId,
      validation: {
        warnings: validation.warnings,
        stats: validation.stats
      }
    });
  } catch (err) {
    console.error("Error starting reconstruction:", err);
    return res.status(500).json({ error: "Failed to start reconstruction", details: err instanceof Error ? err.message : String(err) });
  }
});

// Query job status
router.get("/api/reconstruct/:jobId", async (req, res) => {
  const jobId = req.params.jobId;
  try {
    const job = await storage.getPhotogrammetryJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    
    // Also fetch the reconstruction state for progress/currentStep
    const reconState = await storage.getProjectReconstructionState(job.projectId);
    
    // Merge reconstruction state into job response for frontend compatibility
    const jobWithProgress = {
      ...job,
      progress: reconState.progress,
      currentStep: reconState.currentStep,
      artifacts: reconState.artifacts,
      thumbnailUrl: (reconState.artifacts as any)?.orthophoto?.url ?? null,
    };
    
    return res.json({ job: jobWithProgress });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch job", details: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
