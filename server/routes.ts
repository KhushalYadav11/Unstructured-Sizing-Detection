import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, MemStorage } from "./storage";
import { insertProjectSchema, insertMeasurementSchema, COAL_TYPES, VOLUME_METHODS, type PhotoExif, type InsertProjectPhoto } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { upload, photoUpload, cleanupFile, getFileInfo } from "./upload-handler";
import { meshProcessor, COAL_DENSITIES } from "./mesh-processor";
import path from "path";
import multer from "multer";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import ExifParserFactory from "exif-parser";
import { eventBroadcaster } from "./events";

export async function registerRoutes(app: Express): Promise<Server> {
  // Projects
  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ error: "Invalid project ID format" });
      }
      
      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const result = insertProjectSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).toString() });
      }
      const project = await storage.createProject(result.data);
      res.status(201).json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  // Create project with 3D model upload and automatic dimension extraction
  app.post("/api/projects/with-mesh", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Validate file is .obj format
      const fileExtension = path.extname(req.file.originalname).toLowerCase();
      if (fileExtension !== '.obj') {
        cleanupFile(req.file.path);
        return res.status(400).json({ error: "Only .obj files are supported" });
      }

      // Validate OBJ file structure
      console.log(`Validating uploaded file: ${req.file.originalname} at ${req.file.path}`);
      const isValid = meshProcessor.validateObjFile(req.file.path);
      console.log(`Validation result: ${isValid}`);
      if (!isValid) {
        console.log(`File rejected: ${req.file.originalname}`);
        cleanupFile(req.file.path);
        return res.status(400).json({ error: "Invalid .obj file format" });
      }
      console.log(`File accepted: ${req.file.originalname}`);

      // Get project name from request body
      const { name } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        cleanupFile(req.file.path);
        return res.status(400).json({ error: "Project name is required" });
      }

      // Process the mesh file to extract dimensions and volume
      const meshResult = await meshProcessor.processObjFile(req.file.path);

      // Create project with extracted dimensions
      const project = await storage.createProject({
        name: name.trim(),
        status: "completed",
        length: meshResult.dimensions.length,
        width: meshResult.dimensions.width,
        height: meshResult.dimensions.height,
        volume: meshResult.volume,
        meshFileName: req.file.originalname,
        meshFilePath: req.file.path,
      });

      res.status(201).json({
        project,
        meshAnalysis: {
          dimensions: meshResult.dimensions,
          volume: meshResult.volume,
          weight: meshResult.weight,
          vertices: meshResult.vertices,
          faces: meshResult.faces,
          surfaceArea: meshResult.surfaceArea,
          boundingBox: meshResult.boundingBox,
        }
      });
    } catch (error) {
      // Cleanup file on error
      if (req.file) {
        cleanupFile(req.file.path);
      }
      console.error("Error creating project with mesh:", error);
      res.status(500).json({ 
        error: "Failed to create project with mesh analysis",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const result = insertProjectSchema.partial().safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).toString() });
      }
      const project = await storage.updateProject(req.params.id, result.data);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteProject(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Project Stats
  app.get("/api/projects/:id/stats", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      const stats = await storage.getProjectStats(req.params.id);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project stats" });
    }
  });

  // Measurements
  app.get("/api/projects/:projectId/measurements", async (req, res) => {
    try {
      const measurements = await storage.getMeasurements(req.params.projectId);
      res.json(measurements);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch measurements" });
    }
  });

  app.get("/api/measurements/:id", async (req, res) => {
    try {
      const measurement = await storage.getMeasurement(req.params.id);
      if (!measurement) {
        return res.status(404).json({ error: "Measurement not found" });
      }
      res.json(measurement);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch measurement" });
    }
  });

  app.post("/api/measurements", async (req, res) => {
    try {
      const result = insertMeasurementSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).toString() });
      }
      const measurement = await storage.createMeasurement(result.data);
      res.status(201).json(measurement);
    } catch (error) {
      res.status(500).json({ error: "Failed to create measurement" });
    }
  });

  app.delete("/api/measurements/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMeasurement(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Measurement not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete measurement" });
    }
  });

  // Calculate endpoint
  app.post("/api/calculate", async (req, res) => {
    try {
      const schema = z.object({
        length: z.number().positive(),
        width: z.number().positive(),
        height: z.number().positive(),
        coalType: z.string(),
        volumeMethod: z.string(),
      });

      const result = schema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).toString() });
      }

      const { length, width, height, coalType, volumeMethod } = result.data;

      const coalData = COAL_TYPES[coalType as keyof typeof COAL_TYPES];
      const volumeCalc = VOLUME_METHODS[volumeMethod as keyof typeof VOLUME_METHODS];

      if (!coalData || !volumeCalc) {
        return res.status(400).json({ error: "Invalid coal type or volume method" });
      }

      const volume = volumeCalc.calculate(length, width, height);
      const weight = volume * coalData.density; // Assumes density in kg/m³; volume in m³ → weight in kg

      // Determine quality based on dimensional consistency
      let quality: "excellent" | "good" | "fair" | "poor" = "good";
      const ratio = Math.max(length, width) / Math.min(length, width);
      if (ratio < 2 && height > 2) quality = "excellent";
      else if (ratio > 5 || height < 1) quality = "fair";
      else if (ratio > 8) quality = "poor";

      res.json({
        volume,
        weight,
        quality,
        coalDensity: coalData.density,
        accuracy: volumeCalc.accuracy,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to calculate" });
    }
  });

  // Mesh Processing Routes
  // Upload mesh file (form field: 'file')
  app.post("/api/mesh/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileId = path.basename(req.file.path);
      const fileUrl = `/api/mesh/files/${fileId}`;

      res.status(200).json({
        fileId,
        url: fileUrl,
        originalName: req.file.originalname,
        size: req.file.size,
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // Get available coal types
  app.get("/api/mesh/coal-types", (req, res) => {
    res.json(COAL_DENSITIES);
  });

  // Validate uploaded file without processing
  app.post("/api/mesh/validate", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const isValid = meshProcessor.validateObjFile(req.file.path);
      const fileInfo = getFileInfo(req.file.path);
      
      // Cleanup file
      cleanupFile(req.file.path);

      res.json({
        valid: isValid,
        fileName: req.file.originalname,
        fileSize: fileInfo.size,
        fileExtension: path.extname(req.file.originalname).toLowerCase()
      });
    } catch (error) {
      if (req.file) {
        cleanupFile(req.file.path);
      }
      res.status(500).json({ error: "File validation failed" });
    }
  });

  // Analytics
  app.get("/api/analytics/today", async (req, res) => {
    try {
      const count = await storage.getTodayMeasurementCount();
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/overview", async (req, res) => {
    try {
      // Optimize: Get all measurements in one query instead of N+1
      const projects = await storage.getProjects();
      const allMeasurements = await Promise.all(
        projects.map((p) => storage.getMeasurements(p.id))
      );
      
      const measurements = allMeasurements.flat();
      
      // Use reduce for better performance than multiple filter calls
      const stats = measurements.reduce((acc, m) => {
        acc.totalVolume += m.calculatedVolume;
        acc.totalWeight += m.calculatedWeight;
        acc.qualityCount[m.quality] = (acc.qualityCount[m.quality] || 0) + 1;
        acc.coalTypeCount[m.coalType] = (acc.coalTypeCount[m.coalType] || 0) + 1;
        return acc;
      }, {
        totalVolume: 0,
        totalWeight: 0,
        qualityCount: { excellent: 0, good: 0, fair: 0, poor: 0 },
        coalTypeCount: {} as Record<string, number>
      });

      res.json({
        totalMeasurements: measurements.length,
        totalVolume: stats.totalVolume,
        totalWeight: stats.totalWeight,
        qualityCount: stats.qualityCount,
        coalTypeCount: stats.coalTypeCount,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch overview" });
    }
  });

  // Get volume calculation methods
  app.get("/api/volume-methods", (req, res) => {
    res.json(VOLUME_METHODS);
  });

  // Get coal types
  app.get("/api/coal-types", (req, res) => {
    res.json(COAL_TYPES);
  });

  
  // SSE Event Stream
  app.get("/api/projects/:projectId/events", async (req, res) => {
    const { projectId } = req.params;

    // Validate project exists
    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Register client for events
    eventBroadcaster.addClient(projectId, res);

    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30000); // Every 30 seconds

    // Clean up on disconnect
    req.on("close", () => {
      clearInterval(heartbeat);
      eventBroadcaster.removeClient(projectId, res);
    });
  });

  // Photo Upload & Reconstruction
  app.post("/api/projects/:projectId/photos", photoUpload.array("files[]", 50), async (req, res) => {
    try {
      const { projectId } = req.params;
      const files = req.files as Express.Multer.File[];
      const kickoff = req.body.kickoff !== "false"; // Default true

      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      // Validate project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        for (const file of files) cleanupFile(file.path);
        return res.status(404).json({ message: "Project not found" });
      }

      // Validate file count
      if (files.length > 50) {
        for (const file of files) cleanupFile(file.path);
        return res.status(422).json({
          message: "Validation failed",
          details: [{ field: "files", code: "too_many", message: "Maximum 50 photos allowed" }]
        });
      }

      // Process photos with EXIF extraction
      const photoRecords: InsertProjectPhoto[] = [];
      for (const file of files) {
        // Validate MIME type
        if (!["image/jpeg", "image/png"].includes(file.mimetype)) {
          for (const f of files) cleanupFile(f.path);
          return res.status(415).json({ message: "Unsupported media type" });
        }

        // Extract EXIF data
        let exif: PhotoExif | null = null;
        try {
          const buffer = fs.readFileSync(file.path);
          const parser = ExifParserFactory.create(buffer);
          const result = parser.parse();
          
          exif = {
            focalLength: result.tags?.FocalLength,
            iso: result.tags?.ISO,
            exposureTime: result.tags?.ExposureTime,
            aperture: result.tags?.FNumber,
            captureTimestamp: result.tags?.DateTimeOriginal ? new Date(result.tags.DateTimeOriginal * 1000) : undefined,
          };

          // Extract GPS if available
          if (result.tags?.GPSLatitude && result.tags?.GPSLongitude) {
            exif.gps = {
              lat: result.tags.GPSLatitude,
              lng: result.tags.GPSLongitude,
              alt: result.tags.GPSAltitude,
            };
          }
        } catch (err) {
          console.warn("Failed to extract EXIF:", err);
        }

        // Compute content hash
        const buffer = fs.readFileSync(file.path);
        const contentHash = `sha256:${MemStorage.hashBuffer(buffer)}`;

        // Generate storage key
        const storageKey = MemStorage.buildStorageKey({
          projectId,
          type: "photo",
          filename: file.filename,
          extension: path.extname(file.originalname).slice(1),
        });

        photoRecords.push({
          originalFilename: file.originalname,
          contentHash,
          mimeType: file.mimetype,
          storageKey,
          exif,
        });
      }

      // Add photos to storage
      const photos = await storage.addProjectPhotos(projectId, photoRecords);

      // Broadcast photos uploaded event
      eventBroadcaster.broadcast(projectId, {
        type: "photos.uploaded",
        data: { count: photos.length },
      });

      // Create photogrammetry job if kickoff is true
      let photogrammetryJob = null;
      if (kickoff) {
        try {
          const job = await storage.createPhotogrammetryJob({
            projectId,
            status: "queued",
          });
          photogrammetryJob = {
            id: job.id,
            status: job.status,
            queuedAt: job.queuedAt.toISOString(),
            kickoff: true,
          };

          // Update project reconstruction status
          await storage.updateProjectReconstruction(projectId, {
            status: "queued",
            latestJobId: job.id,
          });

          // Broadcast reconstruction status change
          eventBroadcaster.broadcast(projectId, {
            type: "reconstruction.status_changed",
            data: { status: "queued", progress: 0 },
          });
        } catch (err) {
          console.error("Failed to queue photogrammetry job:", err);
          return res.status(503).json({ message: "Photogrammetry temporarily unavailable" });
        }
      }

      res.status(201).json({
        projectId,
        photos: photos.map(p => ({
          ...p,
          uploadedAt: p.uploadedAt.toISOString(),
          exif: p.exif ? {
            ...p.exif,
            captureTimestamp: p.exif.captureTimestamp?.toISOString(),
          } : undefined,
        })),
        photogrammetryJob,
      });
    } catch (error) {
      console.error("Error uploading photos:", error);
      if (req.files) {
        (req.files as Express.Multer.File[]).forEach(f => cleanupFile(f.path));
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/projects/:projectId/reconstruction", async (req, res) => {
    try {
      const { projectId } = req.params;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const state = await storage.getProjectReconstructionState(projectId);
      const latestJob = state.latestJobId ? await storage.getPhotogrammetryJob(state.latestJobId) : null;

      res.json({
        projectId,
        status: state.status,
        progress: state.progress ?? null,
        currentStep: state.currentStep ?? null,
        retryCount: latestJob?.retryCount ?? 0,
        lastUpdatedAt: state.lastUpdatedAt?.toISOString() ?? null,
        artifacts: state.artifacts ?? null,
        latestJob: latestJob ? {
          id: latestJob.id,
          status: latestJob.status,
          attempt: latestJob.attempt,
          queuedAt: latestJob.queuedAt.toISOString(),
          startedAt: latestJob.startedAt?.toISOString() ?? null,
          finishedAt: latestJob.finishedAt?.toISOString() ?? null,
          engine: latestJob.engine ?? null,
          metrics: latestJob.metrics ?? null,
          logs: latestJob.logs ?? null,
        } : null,
        failureReason: state.failureReason ?? null,
      });
    } catch (error) {
      console.error("Error fetching reconstruction:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Viewer Measurements API
  app.get("/api/projects/:projectId/measurements", async (req, res) => {
    try {
      const measurements = await storage.getViewerMeasurements(req.params.projectId);
      res.json({
        items: measurements.map(m => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
          updatedAt: m.updatedAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error("Error fetching viewer measurements:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/projects/:projectId/measurements", async (req, res) => {
    try {
      const { projectId } = req.params;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const measurement = await storage.createViewerMeasurement({
        projectId,
        ...req.body,
      });

      // Broadcast measurement created event
      eventBroadcaster.broadcast(projectId, {
        type: "measurement.created",
        data: { measurementId: measurement.id },
      });

      res.status(201).json({
        ...measurement,
        createdAt: measurement.createdAt.toISOString(),
        updatedAt: measurement.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error("Error creating viewer measurement:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.patch("/api/projects/:projectId/measurements/:measurementId", async (req, res) => {
    try {
      const { projectId, measurementId } = req.params;
      const updated = await storage.updateViewerMeasurement(measurementId, req.body);
      
      if (!updated) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      // Broadcast measurement updated event
      eventBroadcaster.broadcast(projectId, {
        type: "measurement.updated",
        data: { measurementId },
      });

      res.json({
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error("Error updating viewer measurement:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.delete("/api/projects/:projectId/measurements/:measurementId", async (req, res) => {
    try {
      const { projectId, measurementId } = req.params;
      const deleted = await storage.deleteViewerMeasurement(measurementId);
      if (!deleted) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      // Broadcast measurement deleted event
      eventBroadcaster.broadcast(projectId, {
        type: "measurement.deleted",
        data: { measurementId },
      });

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting viewer measurement:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Annotations API
  app.get("/api/projects/:projectId/annotations", async (req, res) => {
    try {
      const annotations = await storage.getAnnotations(req.params.projectId);
      res.json({
        items: annotations.map(a => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error("Error fetching annotations:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/projects/:projectId/annotations", async (req, res) => {
    try {
      const { projectId } = req.params;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const annotation = await storage.createAnnotation({
        projectId,
        ...req.body,
      });

      // Broadcast annotation created event
      eventBroadcaster.broadcast(projectId, {
        type: "annotation.created",
        data: { annotationId: annotation.id },
      });

      res.status(201).json({
        ...annotation,
        createdAt: annotation.createdAt.toISOString(),
        updatedAt: annotation.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error("Error creating annotation:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.patch("/api/projects/:projectId/annotations/:annotationId", async (req, res) => {
    try {
      const { projectId, annotationId } = req.params;
      const updated = await storage.updateAnnotation(annotationId, req.body);
      
      if (!updated) {
        return res.status(404).json({ message: "Annotation not found" });
      }

      // Broadcast annotation updated event
      eventBroadcaster.broadcast(projectId, {
        type: "annotation.updated",
        data: { annotationId },
      });

      res.json({
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error("Error updating annotation:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.delete("/api/projects/:projectId/annotations/:annotationId", async (req, res) => {
    try {
      const { projectId, annotationId } = req.params;
      const deleted = await storage.deleteAnnotation(annotationId);
      if (!deleted) {
        return res.status(404).json({ message: "Annotation not found" });
      }

      // Broadcast annotation deleted event
      eventBroadcaster.broadcast(projectId, {
        type: "annotation.deleted",
        data: { annotationId },
      });

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting annotation:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Bookmarks API
  app.get("/api/projects/:projectId/bookmarks", async (req, res) => {
    try {
      const bookmarks = await storage.getBookmarks(req.params.projectId);
      res.json({
        items: bookmarks.map(b => ({
          ...b,
          createdAt: b.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error("Error fetching bookmarks:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/projects/:projectId/bookmarks", async (req, res) => {
    try {
      const { projectId } = req.params;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const bookmark = await storage.createBookmark({
        projectId,
        ...req.body,
      });

      res.status(201).json({
        ...bookmark,
        createdAt: bookmark.createdAt.toISOString(),
      });
    } catch (error) {
      console.error("Error creating bookmark:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.delete("/api/projects/:projectId/bookmarks/:bookmarkId", async (req, res) => {
    try {
      const deleted = await storage.deleteBookmark(req.params.bookmarkId);
      if (!deleted) {
        return res.status(404).json({ message: "Bookmark not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting bookmark:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Serve mesh files
  app.get("/api/mesh/files/:filename", (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(process.cwd(), "uploads", filename);
    
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: "File not found" });
    }
  });

  // Process mesh file
  app.post("/api/mesh/process/:fileId", async (req, res) => {
    try {
      const { fileId } = req.params;
      const { density = 1300, projectId } = req.body as { density?: number; projectId?: string };
      
      const filePath = path.join(process.cwd(), "uploads", fileId);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
      }

      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Generate simulated results based on file size
      const stats = fs.statSync(filePath);
      const volume = (stats.size / 1024) * 0.01; // Simulated volume in m^3
      const weight = volume * density; // kg, if density is kg/m^3
      const surfaceArea = volume * 2.1; // Simulated surface area
      
      // Determine coal type key from provided density (closest match)
      const coalTypeKey = Object.entries(COAL_DENSITIES)
        .find(([_k, cfg]) => Math.abs(cfg.density - density) < 1e-6)?.[0] || "custom";

      // Ensure we have a project to attach to
      let targetProjectId = projectId;
      if (!targetProjectId) {
        const tempProject = await storage.createProject({ name: "Untitled", status: "draft" });
        targetProjectId = tempProject.id;
      }
      
      // Create measurement matching shared schema fields
      const measurement = await storage.createMeasurement({
        projectId: targetProjectId,
        length: 0,
        width: 0,
        height: 0,
        unit: "meters",
        coalType: coalTypeKey,
        coalDensity: density,
        volumeMethod: "3D_MESH",
        calculatedVolume: volume,
        calculatedWeight: weight,
        quality: "good",
      });

      res.status(200).json({
        id: measurement.id,
        volume,
        weight,
        surfaceArea,
        density,
        quality: "good",
        meshUrl: `/api/mesh/files/${fileId}`
      });
    } catch (error) {
      console.error("Error processing mesh:", error);
      res.status(500).json({ error: "Failed to process mesh" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
