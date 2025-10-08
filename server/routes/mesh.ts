import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = ['.obj', '.ply', '.stl', '.glb'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only .obj, .ply, .stl, and .glb files are allowed.'));
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Coal density presets (g/cm³)
const COAL_TYPES = {
  lignite: 1.2,
  bituminous: 1.3,
  anthracite: 1.5
};

// Upload mesh file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
    const fileUrl = `/api/mesh/files/${fileId}${path.extname(req.file.filename)}`;

    // Store file metadata in database
    await db.meshFile.create({
      data: {
        id: fileId,
        filename: req.file.originalname,
        filepath: req.file.path,
        filesize: req.file.size,
        filetype: path.extname(req.file.filename).substring(1)
      }
    });

    res.status(200).json({
      fileId,
      url: fileUrl,
      originalName: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Serve mesh files
router.get('/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '..', 'uploads', filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Process mesh file
router.post('/process/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { density = 1.3, projectId } = req.body;

    // Get file from database
    const meshFile = await db.meshFile.findUnique({
      where: { id: fileId }
    });

    if (!meshFile) {
      return res.status(404).json({ error: 'File not found' });
    }

    // In a real implementation, this would call a Python script or service
    // to process the 3D mesh file. For now, we'll simulate the processing.
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Generate simulated results based on file size
    const volume = (meshFile.filesize / 1024) * 0.01; // Simulated volume calculation
    const weight = volume * density;
    const surfaceArea = volume * 2.1; // Simulated surface area
    
    // Create measurement record
    const measurement = await db.measurement.create({
      data: {
        volume,
        weight,
        surfaceArea,
        density,
        meshFileId: fileId,
        projectId: projectId || undefined,
        quality: 'Good',
        meshUrl: `/api/mesh/files/${fileId}${path.extname(meshFile.filename)}`
      }
    });

    res.status(200).json({
      id: measurement.id,
      volume,
      weight,
      surfaceArea,
      density,
      quality: 'Good',
      meshUrl: `/api/mesh/files/${fileId}${path.extname(meshFile.filename)}`
    });
  } catch (error) {
    console.error('Error processing mesh:', error);
    res.status(500).json({ error: 'Failed to process mesh' });
  }
});

// Get coal types and densities
router.get('/coal-types', (req, res) => {
  res.status(200).json(COAL_TYPES);
});

// Save measurement to project
router.post('/measurements/:measurementId/save', async (req, res) => {
  try {
    const { measurementId } = req.params;
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    // Check if project exists
    const project = await db.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Update measurement with project ID
    const measurement = await db.measurement.update({
      where: { id: measurementId },
      data: { projectId }
    });

    res.status(200).json(measurement);
  } catch (error) {
    console.error('Error saving measurement:', error);
    res.status(500).json({ error: 'Failed to save measurement' });
  }
});

export default router;