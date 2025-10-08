import {
  type Project,
  type InsertProject,
  type Measurement,
  type InsertMeasurement,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;

  // Measurements
  getMeasurements(projectId: string): Promise<Measurement[]>;
  getMeasurement(id: string): Promise<Measurement | undefined>;
  createMeasurement(measurement: InsertMeasurement): Promise<Measurement>;
  deleteMeasurement(id: string): Promise<boolean>;

  // Analytics
  getTodayMeasurementCount(): Promise<number>;
  getProjectStats(projectId: string): Promise<{
    totalMeasurements: number;
    totalVolume: number;
    totalWeight: number;
    averageQuality: string;
  }>;
}

export class MemStorage implements IStorage {
  private projects: Map<string, Project>;
  private measurements: Map<string, Measurement>;

  constructor() {
    this.projects = new Map();
    this.measurements = new Map();
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return Array.from(this.projects.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const now = new Date();
    const project: Project = {
      ...insertProject,
      id,
      status: insertProject.status || "draft",
      length: insertProject.length || null,
      width: insertProject.width || null,
      height: insertProject.height || null,
      volume: insertProject.volume || null,
      meshFileName: insertProject.meshFileName || null,
      meshFilePath: insertProject.meshFilePath || null,
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(
    id: string,
    updates: Partial<InsertProject>
  ): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;

    const updated: Project = {
      ...project,
      ...updates,
      updatedAt: new Date(),
    };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    const deleted = this.projects.delete(id);
    if (deleted) {
      // Delete associated measurements
      Array.from(this.measurements.entries()).forEach(([measurementId, measurement]) => {
        if (measurement.projectId === id) {
          this.measurements.delete(measurementId);
        }
      });
    }
    return deleted;
  }

  // Measurements
  async getMeasurements(projectId: string): Promise<Measurement[]> {
    return Array.from(this.measurements.values())
      .filter((m) => m.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getMeasurement(id: string): Promise<Measurement | undefined> {
    return this.measurements.get(id);
  }

  async createMeasurement(insertMeasurement: InsertMeasurement): Promise<Measurement> {
    const id = randomUUID();
    const measurement: Measurement = {
      ...insertMeasurement,
      id,
      unit: insertMeasurement.unit || "meters",
      quality: insertMeasurement.quality || "good",
      createdAt: new Date(),
    };
    this.measurements.set(id, measurement);

    // Update project's updatedAt timestamp
    const project = this.projects.get(insertMeasurement.projectId);
    if (project) {
      this.projects.set(insertMeasurement.projectId, {
        ...project,
        updatedAt: new Date(),
      });
    }

    return measurement;
  }

  async deleteMeasurement(id: string): Promise<boolean> {
    return this.measurements.delete(id);
  }

  // Analytics
  async getTodayMeasurementCount(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return Array.from(this.measurements.values()).filter((m) => {
      const measurementDate = new Date(m.createdAt);
      measurementDate.setHours(0, 0, 0, 0);
      return measurementDate.getTime() === today.getTime();
    }).length;
  }

  async getProjectStats(projectId: string): Promise<{
    totalMeasurements: number;
    totalVolume: number;
    totalWeight: number;
    averageQuality: string;
  }> {
    const measurements = await this.getMeasurements(projectId);
    
    const totalMeasurements = measurements.length;
    const totalVolume = measurements.reduce((sum, m) => sum + m.calculatedVolume, 0);
    const totalWeight = measurements.reduce((sum, m) => sum + m.calculatedWeight, 0);
    
    const qualityScores = { excellent: 4, good: 3, fair: 2, poor: 1 };
    const avgScore = measurements.length > 0
      ? measurements.reduce((sum, m) => sum + qualityScores[m.quality], 0) / measurements.length
      : 0;
    
    let averageQuality = "good";
    if (avgScore >= 3.5) averageQuality = "excellent";
    else if (avgScore >= 2.5) averageQuality = "good";
    else if (avgScore >= 1.5) averageQuality = "fair";
    else averageQuality = "poor";

    return { totalMeasurements, totalVolume, totalWeight, averageQuality };
  }
}

export const storage = new MemStorage();
