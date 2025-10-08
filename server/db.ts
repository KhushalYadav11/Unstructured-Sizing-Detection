// Simple in-memory database for development
import { v4 as uuidv4 } from 'uuid';

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Measurement {
  id: string;
  type: string;
  volume?: number;
  weight?: number;
  meshFileId?: string;
  coalType?: string;
  quality?: string;
  projectId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MeshFile {
  id: string;
  filename: string;
  path: string;
  createdAt: Date;
}

// In-memory storage
const projects: Project[] = [];
const measurements: Measurement[] = [];
const meshFiles: MeshFile[] = [];

// Project methods
export const createProject = (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
  const project: Project = {
    id: uuidv4(),
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  projects.push(project);
  return project;
};

export const getProjects = () => {
  return projects;
};

export const getProject = (id: string) => {
  return projects.find(p => p.id === id);
};

// Measurement methods
export const createMeasurement = (data: Omit<Measurement, 'id' | 'createdAt' | 'updatedAt'>) => {
  const measurement: Measurement = {
    id: uuidv4(),
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  measurements.push(measurement);
  return measurement;
};

export const getMeasurements = (projectId?: string) => {
  if (projectId) {
    return measurements.filter(m => m.projectId === projectId);
  }
  return measurements;
};

export const getMeasurement = (id: string) => {
  return measurements.find(m => m.id === id);
};

export const updateMeasurement = (id: string, data: Partial<Omit<Measurement, 'id' | 'createdAt' | 'updatedAt'>>) => {
  const index = measurements.findIndex(m => m.id === id);
  if (index === -1) return null;
  
  measurements[index] = {
    ...measurements[index],
    ...data,
    updatedAt: new Date()
  };
  
  return measurements[index];
};

// MeshFile methods
export const createMeshFile = (data: Omit<MeshFile, 'id' | 'createdAt'>) => {
  const meshFile: MeshFile = {
    id: uuidv4(),
    ...data,
    createdAt: new Date()
  };
  meshFiles.push(meshFile);
  return meshFile;
};

export const getMeshFile = (id: string) => {
  return meshFiles.find(f => f.id === id);
};

// Initialize with some sample data
createProject({ name: 'Sample Project 1', description: 'A sample coal mining project' });
createProject({ name: 'Sample Project 2', description: 'Another sample project' });

// Add some sample measurements
const project1 = projects[0];
if (project1) {
  createMeasurement({ 
    type: 'manual', 
    volume: 1000, 
    weight: 1300, 
    coalType: 'bituminous',
    quality: 'Good',
    projectId: project1.id 
  });
}

export default {
  projects,
  measurements,
  meshFiles,
  createProject,
  getProjects,
  getProject,
  createMeasurement,
  getMeasurements,
  getMeasurement,
  updateMeasurement,
  createMeshFile,
  getMeshFile
};