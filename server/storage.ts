import {
  type Project,
  type InsertProject,
  type Measurement,
  type InsertMeasurement,
  type ViewerMeasurement,
  type InsertViewerMeasurement,
  type ProjectPhoto,
  type InsertProjectPhoto,
  type PhotogrammetryJob,
  type NewPhotogrammetryJob,
  type UpdatePhotogrammetryJob,
  type ProjectReconstructionState,
  type ProjectReconstructionUpdate,
  type PhotogrammetryJobStatus,
  type ProjectAnnotation,
  type InsertProjectAnnotation,
  type ProjectBookmark,
  type InsertProjectBookmark,
} from "@shared/schema";
import { randomUUID, createHash } from "crypto";

export interface IStorage {
  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;

  // Photos
  addProjectPhotos(projectId: string, photos: InsertProjectPhoto[]): Promise<ProjectPhoto[]>;
  getProjectPhotos(projectId: string): Promise<ProjectPhoto[]>;

  // Reconstruction state
  getProjectReconstructionState(projectId: string): Promise<ProjectReconstructionState>;
  updateProjectReconstruction(
    projectId: string,
    update: ProjectReconstructionUpdate
  ): Promise<ProjectReconstructionState>;

  // Photogrammetry jobs
  createPhotogrammetryJob(job: NewPhotogrammetryJob): Promise<PhotogrammetryJob>;
  updatePhotogrammetryJob(id: string, update: UpdatePhotogrammetryJob): Promise<PhotogrammetryJob | undefined>;
  getPhotogrammetryJob(id: string): Promise<PhotogrammetryJob | undefined>;
  getLatestPhotogrammetryJob(projectId: string): Promise<PhotogrammetryJob | undefined>;

  // Measurements
  getMeasurements(projectId: string): Promise<Measurement[]>;
  getMeasurement(id: string): Promise<Measurement | undefined>;
  createMeasurement(measurement: InsertMeasurement): Promise<Measurement>;
  deleteMeasurement(id: string): Promise<boolean>;

  // Viewer measurements
  getViewerMeasurements(projectId: string): Promise<ViewerMeasurement[]>;
  createViewerMeasurement(measurement: InsertViewerMeasurement): Promise<ViewerMeasurement>;
  updateViewerMeasurement(id: string, update: Partial<InsertViewerMeasurement>): Promise<ViewerMeasurement | undefined>;
  deleteViewerMeasurement(id: string): Promise<boolean>;

  // Annotations
  getAnnotations(projectId: string): Promise<ProjectAnnotation[]>;
  createAnnotation(annotation: InsertProjectAnnotation): Promise<ProjectAnnotation>;
  updateAnnotation(id: string, update: Partial<InsertProjectAnnotation>): Promise<ProjectAnnotation | undefined>;
  deleteAnnotation(id: string): Promise<boolean>;

  // Bookmarks
  getBookmarks(projectId: string): Promise<ProjectBookmark[]>;
  createBookmark(bookmark: InsertProjectBookmark): Promise<ProjectBookmark>;
  deleteBookmark(id: string): Promise<boolean>;

  // Analytics
  getTodayMeasurementCount(): Promise<number>;
  getProjectStats(projectId: string): Promise<{
    totalMeasurements: number;
    totalVolume: number;
    totalWeight: number;
    averageQuality: string;
  }>;
}

export interface StorageKeyOptions {
  projectId: string;
  filename?: string;
  extension?: string;
  type: "photo" | "preview" | "artifact" | "log" | "annotation";
  artifactName?: string;
}

export class MemStorage implements IStorage {
  private projects: Map<string, Project>;
  private measurements: Map<string, Measurement>;
  private viewerMeasurements: Map<string, ViewerMeasurement>;
  private annotations: Map<string, ProjectAnnotation>;
  private bookmarks: Map<string, ProjectBookmark>;
  private photogrammetryJobs: Map<string, PhotogrammetryJob>;

  constructor() {
    this.projects = new Map();
    this.measurements = new Map();
    this.viewerMeasurements = new Map();
    this.annotations = new Map();
    this.bookmarks = new Map();
    this.photogrammetryJobs = new Map();
  }

  // Utility helpers
  private ensureProject(id: string): Project {
    const project = this.projects.get(id);
    if (!project) {
      throw new Error(`Project ${id} not found`);
    }
    return project;
  }

  private now() {
    return new Date();
  }

  static buildStorageKey(options: StorageKeyOptions): string {
    const { projectId, type, filename, extension, artifactName } = options;
    const base = `projects/${projectId}`;
    switch (type) {
      case "photo": {
        const uuid = filename ?? randomUUID();
        const ext = extension ?? "jpg";
        return `${base}/photos/${uuid}.${ext.replace(/^\./, "")}`;
      }
      case "artifact": {
        const name = artifactName ?? filename ?? randomUUID();
        const ext = extension ? `.${extension.replace(/^\./, "")}` : "";
        return `${base}/reconstruction/${name}${ext}`;
      }
      case "preview": {
        return `${base}/previews/${filename ?? randomUUID()}`;
      }
      case "log": {
        const name = filename ?? `run-${Date.now()}.log`;
        return `${base}/logs/${name}`;
      }
      case "annotation": {
        const name = filename ?? randomUUID();
        const ext = extension ? `.${extension.replace(/^\./, "")}` : "";
        return `${base}/annotations/${name}${ext}`;
      }
      default:
        throw new Error(`Unsupported storage key type: ${type satisfies never}`);
    }
  }

  static hashBuffer(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
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
    const now = this.now();
    const project: Project = {
      ...insertProject,
      id,
      status: insertProject.status || "draft",
      length: insertProject.length ?? null,
      width: insertProject.width ?? null,
      height: insertProject.height ?? null,
      volume: insertProject.volume ?? null,
      weight: insertProject.weight ?? null,
      meshFileName: insertProject.meshFileName ?? null,
      meshFilePath: insertProject.meshFilePath ?? null,
      photos: insertProject.photos ?? [],
      reconstructionStatus: insertProject.reconstructionStatus ?? "none",
      reconstructionProgress: insertProject.reconstructionProgress ?? null,
      reconstructionCurrentStep: insertProject.reconstructionCurrentStep ?? null,
      reconstructionArtifacts: insertProject.reconstructionArtifacts ?? null,
      reconstructionFailure: insertProject.reconstructionFailure ?? null,
      reconstructionUpdatedAt: insertProject.reconstructionUpdatedAt ?? now,
      latestPhotogrammetryJobId: insertProject.latestPhotogrammetryJobId ?? null,
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
      length: updates.length ?? project.length,
      width: updates.width ?? project.width,
      height: updates.height ?? project.height,
      volume: updates.volume ?? project.volume,
      weight: updates.weight ?? project.weight,
      meshFileName: updates.meshFileName ?? project.meshFileName,
      meshFilePath: updates.meshFilePath ?? project.meshFilePath,
      photos: updates.photos ?? project.photos,
      reconstructionStatus: updates.reconstructionStatus ?? project.reconstructionStatus,
      reconstructionProgress: updates.reconstructionProgress ?? project.reconstructionProgress,
      reconstructionCurrentStep: updates.reconstructionCurrentStep ?? project.reconstructionCurrentStep,
      reconstructionArtifacts: updates.reconstructionArtifacts ?? project.reconstructionArtifacts,
      reconstructionFailure: updates.reconstructionFailure ?? project.reconstructionFailure,
      reconstructionUpdatedAt: updates.reconstructionUpdatedAt ?? this.now(),
      latestPhotogrammetryJobId: updates.latestPhotogrammetryJobId ?? project.latestPhotogrammetryJobId,
      updatedAt: this.now(),
    };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    const deleted = this.projects.delete(id);
    if (deleted) {
      Array.from(this.measurements.entries()).forEach(([measurementId, measurement]) => {
        if (measurement.projectId === id) {
          this.measurements.delete(measurementId);
        }
      });
      Array.from(this.viewerMeasurements.entries()).forEach(([measurementId, measurement]) => {
        if (measurement.projectId === id) {
          this.viewerMeasurements.delete(measurementId);
        }
      });
      Array.from(this.annotations.entries()).forEach(([annotationId, annotation]) => {
        if (annotation.projectId === id) {
          this.annotations.delete(annotationId);
        }
      });
      Array.from(this.bookmarks.entries()).forEach(([bookmarkId, bookmark]) => {
        if (bookmark.projectId === id) {
          this.bookmarks.delete(bookmarkId);
        }
      });
      Array.from(this.photogrammetryJobs.entries()).forEach(([jobId, job]) => {
        if (job.projectId === id) {
          this.photogrammetryJobs.delete(jobId);
        }
      });
    }
    return deleted;
  }

  // Photos
  async addProjectPhotos(projectId: string, photos: InsertProjectPhoto[]): Promise<ProjectPhoto[]> {
    const project = this.ensureProject(projectId);
    const now = this.now();
    const newPhotos = photos.map((photo) => {
      const id = photo.id ?? randomUUID();
      return {
        id,
        projectId,
        originalFilename: photo.originalFilename,
        mimeType: photo.mimeType,
        contentHash: photo.contentHash,
        storageKey: photo.storageKey,
        exif: photo.exif ?? null,
        uploadedAt: photo.uploadedAt ?? now,
      } satisfies ProjectPhoto;
    });

    const updatedProject: Project = {
      ...project,
      photos: [...project.photos, ...newPhotos],
      updatedAt: now,
    };

    this.projects.set(projectId, updatedProject);
    return newPhotos;
  }

  async getProjectPhotos(projectId: string): Promise<ProjectPhoto[]> {
    const project = this.projects.get(projectId);
    return project?.photos ?? [];
  }

  // Reconstruction state
  async getProjectReconstructionState(projectId: string): Promise<ProjectReconstructionState> {
    const project = this.ensureProject(projectId);
    return {
      status: project.reconstructionStatus,
      progress: project.reconstructionProgress ?? null,
      currentStep: project.reconstructionCurrentStep ?? null,
      artifacts: project.reconstructionArtifacts ?? null,
      failureReason: project.reconstructionFailure ?? null,
      lastUpdatedAt: project.reconstructionUpdatedAt ?? project.updatedAt,
      latestJobId: project.latestPhotogrammetryJobId ?? null,
    };
  }

  async updateProjectReconstruction(
    projectId: string,
    update: ProjectReconstructionUpdate
  ): Promise<ProjectReconstructionState> {
    const project = this.ensureProject(projectId);
    const now = this.now();

    const updatedProject: Project = {
      ...project,
      reconstructionStatus: update.status ?? project.reconstructionStatus,
      reconstructionProgress: update.progress ?? project.reconstructionProgress,
      reconstructionCurrentStep: update.currentStep ?? project.reconstructionCurrentStep,
      reconstructionArtifacts: update.artifacts ?? project.reconstructionArtifacts,
      reconstructionFailure: update.failureReason ?? project.reconstructionFailure,
      reconstructionUpdatedAt: now,
      latestPhotogrammetryJobId: update.latestJobId ?? project.latestPhotogrammetryJobId,
      updatedAt: now,
    };

    this.projects.set(projectId, updatedProject);

    return {
      status: updatedProject.reconstructionStatus,
      progress: updatedProject.reconstructionProgress ?? null,
      currentStep: updatedProject.reconstructionCurrentStep ?? null,
      artifacts: updatedProject.reconstructionArtifacts ?? null,
      failureReason: updatedProject.reconstructionFailure ?? null,
      lastUpdatedAt: updatedProject.reconstructionUpdatedAt ?? now,
      latestJobId: updatedProject.latestPhotogrammetryJobId ?? null,
    };
  }

  // Photogrammetry jobs
  async createPhotogrammetryJob(job: NewPhotogrammetryJob): Promise<PhotogrammetryJob> {
    const id = job.id ?? randomUUID();
    const now = this.now();
    const jobRecord: PhotogrammetryJob = {
      ...job,
      id,
      attempt: job.attempt ?? 1,
      retryCount: job.retryCount ?? 0,
      queuedAt: job.queuedAt ?? now,
      status: job.status ?? "queued",
      failure: job.failure ?? null,
      metrics: job.metrics ?? null,
      logs: job.logs ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.photogrammetryJobs.set(id, jobRecord);

    const project = this.ensureProject(job.projectId);
    this.projects.set(job.projectId, {
      ...project,
      latestPhotogrammetryJobId: id,
      updatedAt: now,
    });

    return jobRecord;
  }

  async updatePhotogrammetryJob(
    id: string,
    update: UpdatePhotogrammetryJob
  ): Promise<PhotogrammetryJob | undefined> {
    const job = this.photogrammetryJobs.get(id);
    if (!job) return undefined;

    const updated: PhotogrammetryJob = {
      ...job,
      ...update,
      status: (update.status as PhotogrammetryJobStatus | undefined) ?? job.status,
      failure: update.failure ?? job.failure,
      metrics: update.metrics ?? job.metrics,
      logs: update.logs ?? job.logs,
      attempt: update.attempt ?? job.attempt,
      retryCount: update.retryCount ?? job.retryCount,
      queuedAt: update.queuedAt ?? job.queuedAt,
      startedAt: update.startedAt ?? job.startedAt,
      finishedAt: update.finishedAt ?? job.finishedAt,
      engine: update.engine ?? job.engine,
      updatedAt: this.now(),
    };

    this.photogrammetryJobs.set(id, updated);
    return updated;
  }

  async getPhotogrammetryJob(id: string): Promise<PhotogrammetryJob | undefined> {
    return this.photogrammetryJobs.get(id);
  }

  async getLatestPhotogrammetryJob(projectId: string): Promise<PhotogrammetryJob | undefined> {
    const project = this.ensureProject(projectId);
    const jobId = project.latestPhotogrammetryJobId;
    if (!jobId) return undefined;
    return this.photogrammetryJobs.get(jobId);
  }

  // Measurements (legacy)
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
      createdAt: this.now(),
    };
    this.measurements.set(id, measurement);

    const project = this.projects.get(insertMeasurement.projectId);
    if (project) {
      this.projects.set(insertMeasurement.projectId, {
        ...project,
        updatedAt: this.now(),
      });
    }

    return measurement;
  }

  async deleteMeasurement(id: string): Promise<boolean> {
    return this.measurements.delete(id);
  }

  // Viewer measurements
  async getViewerMeasurements(projectId: string): Promise<ViewerMeasurement[]> {
    return Array.from(this.viewerMeasurements.values())
      .filter((m) => m.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createViewerMeasurement(measurement: InsertViewerMeasurement): Promise<ViewerMeasurement> {
    const id = measurement.id ?? randomUUID();
    const now = this.now();
    const record: ViewerMeasurement = {
      ...measurement,
      id,
      projectId: measurement.projectId,
      label: measurement.label ?? null,
      metadata: measurement.metadata ?? null,
      createdBy: measurement.createdBy ?? null,
      createdAt: measurement.createdAt ?? now,
      updatedAt: measurement.updatedAt ?? now,
    };
    this.viewerMeasurements.set(id, record);
    return record;
  }

  async updateViewerMeasurement(
    id: string,
    update: Partial<InsertViewerMeasurement>
  ): Promise<ViewerMeasurement | undefined> {
    const existing = this.viewerMeasurements.get(id);
    if (!existing) return undefined;

    const updated: ViewerMeasurement = {
      ...existing,
      ...update,
      label: update.label ?? existing.label,
      points: update.points ?? existing.points,
      units: update.units ?? existing.units,
      value: update.value ?? existing.value,
      metadata: update.metadata ?? existing.metadata,
      updatedAt: this.now(),
    };

    this.viewerMeasurements.set(id, updated);
    return updated;
  }

  async deleteViewerMeasurement(id: string): Promise<boolean> {
    return this.viewerMeasurements.delete(id);
  }

  // Annotations
  async getAnnotations(projectId: string): Promise<ProjectAnnotation[]> {
    return Array.from(this.annotations.values())
      .filter((a) => a.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createAnnotation(annotation: InsertProjectAnnotation): Promise<ProjectAnnotation> {
    const id = annotation.id ?? randomUUID();
    const now = this.now();
    const record: ProjectAnnotation = {
      ...annotation,
      id,
      attachments: annotation.attachments ?? [],
      createdAt: annotation.createdAt ?? now,
      updatedAt: annotation.updatedAt ?? now,
    };
    this.annotations.set(id, record);
    return record;
  }

  async updateAnnotation(
    id: string,
    update: Partial<InsertProjectAnnotation>
  ): Promise<ProjectAnnotation | undefined> {
    const existing = this.annotations.get(id);
    if (!existing) return undefined;

    const updated: ProjectAnnotation = {
      ...existing,
      ...update,
      attachments: update.attachments ?? existing.attachments,
      updatedAt: this.now(),
    };

    this.annotations.set(id, updated);
    return updated;
  }

  async deleteAnnotation(id: string): Promise<boolean> {
    return this.annotations.delete(id);
  }

  // Bookmarks
  async getBookmarks(projectId: string): Promise<ProjectBookmark[]> {
    return Array.from(this.bookmarks.values())
      .filter((b) => b.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createBookmark(bookmark: InsertProjectBookmark): Promise<ProjectBookmark> {
    const id = bookmark.id ?? randomUUID();
    const record: ProjectBookmark = {
      ...bookmark,
      id,
      createdAt: bookmark.createdAt ?? this.now(),
    };
    this.bookmarks.set(id, record);
    return record;
  }

  async deleteBookmark(id: string): Promise<boolean> {
    return this.bookmarks.delete(id);
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

    const qualityScores = { excellent: 4, good: 3, fair: 2, poor: 1 } as const;
    const avgScore = measurements.length > 0
      ? measurements.reduce((sum, m) => sum + qualityScores[m.quality as keyof typeof qualityScores], 0) / measurements.length
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