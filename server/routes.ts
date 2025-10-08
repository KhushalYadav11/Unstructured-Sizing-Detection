import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertMeasurementSchema, COAL_TYPES, VOLUME_METHODS } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { upload, cleanupFile, getFileInfo } from "./upload-handler";
import { meshProcessor, COAL_DENSITIES } from "./mesh-processor";
import path from "path";
import multer from "multer";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

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
