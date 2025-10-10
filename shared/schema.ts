import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export type ReconstructionStatus = "none" | "queued" | "processing" | "failed" | "ready";

export interface PhotoExif {
  focalLength?: number;
  iso?: number;
  exposureTime?: number;
  aperture?: number;
  captureTimestamp?: Date;
  gps?: {
    lat: number;
    lng: number;
    alt?: number;
  };
  [key: string]: unknown;
}

export interface ProjectPhoto {
  id: string;
  projectId: string;
  originalFilename: string;
  contentHash: string;
  mimeType: string;
  storageKey: string;
  exif?: PhotoExif | null;
  uploadedAt: Date;
}

export type InsertProjectPhoto = Omit<ProjectPhoto, "id" | "projectId" | "uploadedAt"> & {
  id?: string;
  uploadedAt?: Date;
};

export interface ReconstructionArtifacts {
  mesh?: {
    format: string;
    url: string;
    sizeBytes?: number;
  };
  pointCloud?: {
    format: string;
    url: string;
    sizeBytes?: number;
  };
  textures?: Array<{
    name: string;
    url: string;
    sizeBytes?: number;
  }>;
  bundleUrl?: string;
  generatedAt?: Date;
}

export type PhotogrammetryJobFailureCode =
  | "engine_error"
  | "timeout"
  | "invalid_input"
  | "storage_error"
  | "engine_unavailable"
  | "unknown";

export interface PhotogrammetryJobFailure {
  code: PhotogrammetryJobFailureCode;
  message?: string;
  details?: Record<string, unknown>;
}

export type ReconstructionFailure = PhotogrammetryJobFailure;

export interface ProjectReconstructionState {
  status: ReconstructionStatus;
  progress: number | null;
  currentStep: string | null;
  artifacts: ReconstructionArtifacts | null;
  failureReason: ReconstructionFailure | null;
  lastUpdatedAt: Date | null;
  latestJobId: string | null;
}

export interface ProjectReconstructionUpdate {
  status?: ReconstructionStatus;
  progress?: number | null;
  currentStep?: string | null;
  artifacts?: ReconstructionArtifacts | null;
  failureReason?: ReconstructionFailure | null;
  latestJobId?: string | null;
}

export type PhotogrammetryJobStatus = "queued" | "processing" | "succeeded" | "failed";

export interface PhotogrammetryJobMetrics {
  runtimeMs?: number;
  avgCpu?: number;
  maxMemoryMb?: number;
}

export interface PhotogrammetryJobLogs {
  previewUrl?: string;
  downloadUrl?: string;
}

export interface PhotogrammetryJob {
  id: string;
  projectId: string;
  status: PhotogrammetryJobStatus;
  attempt: number;
  retryCount: number;
  queuedAt: Date;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  engine?: string | null;
  metrics?: PhotogrammetryJobMetrics | null;
  logs?: PhotogrammetryJobLogs | null;
  failure?: PhotogrammetryJobFailure | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewPhotogrammetryJob = Omit<
  PhotogrammetryJob,
  "id" | "createdAt" | "updatedAt" | "attempt" | "retryCount" | "queuedAt"
> & {
  id?: string;
  attempt?: number;
  retryCount?: number;
  queuedAt?: Date;
};

export type UpdatePhotogrammetryJob = Partial<
  Omit<PhotogrammetryJob, "id" | "projectId" | "createdAt">
>;

export type MeasurementType = "distance" | "area" | "volume";

export interface MeasurementPoint {
  x: number;
  y: number;
  z: number;
  order: number;
}

export interface MeasurementMetadata {
  displayUnits?: string;
  conversionFactor?: number;
  createdBy?: string;
  color?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface ViewerMeasurement {
  id: string;
  projectId: string;
  type: MeasurementType;
  label?: string | null;
  units: string;
  points: MeasurementPoint[];
  value: number;
  metadata?: MeasurementMetadata | null;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertViewerMeasurement = Omit<ViewerMeasurement, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export interface AnnotationAttachment {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  sizeBytes?: number;
  uploadedAt?: Date;
}

export interface ProjectAnnotation {
  id: string;
  projectId: string;
  title: string;
  body: string;
  authorId: string;
  anchor: {
    position: { x: number; y: number; z: number };
    normal?: { x: number; y: number; z: number };
  };
  attachments?: AnnotationAttachment[];
  createdAt: Date;
  updatedAt: Date;
}

export type InsertProjectAnnotation = Omit<ProjectAnnotation, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export interface ProjectBookmark {
  id: string;
  projectId: string;
  name: string;
  camera: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    up: { x: number; y: number; z: number };
    fov: number;
  };
  createdBy: string;
  createdAt: Date;
}

export type InsertProjectBookmark = Omit<ProjectBookmark, "id" | "createdAt"> & {
  id?: string;
  createdAt?: Date;
};

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  status: text("status", { enum: ["draft", "processing", "completed"] }).notNull().default("draft"),
  length: real("length"),
  width: real("width"),
  height: real("height"),
  volume: real("volume"),
  meshFileName: text("mesh_file_name"),
  meshFilePath: text("mesh_file_path"),
  photos: jsonb("photos").$type<ProjectPhoto[]>().notNull().default(sql`'[]'::jsonb`),
  reconstructionStatus: text("reconstruction_status", {
    enum: ["none", "queued", "processing", "failed", "ready"],
  })
    .notNull()
    .default("none"),
  reconstructionProgress: integer("reconstruction_progress"),
  reconstructionCurrentStep: text("reconstruction_current_step"),
  reconstructionArtifacts: jsonb("reconstruction_artifacts").$type<ReconstructionArtifacts | null>().default(null),
  reconstructionFailure: jsonb("reconstruction_failure").$type<ReconstructionFailure | null>().default(null),
  reconstructionUpdatedAt: timestamp("reconstruction_updated_at"),
  latestPhotogrammetryJobId: varchar("latest_photogrammetry_job_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const measurements = pgTable("measurements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  length: real("length").notNull(),
  width: real("width").notNull(),
  height: real("height").notNull(),
  unit: text("unit").notNull().default("meters"),
  coalType: text("coal_type").notNull(),
  coalDensity: real("coal_density").notNull(),
  volumeMethod: text("volume_method").notNull(),
  calculatedVolume: real("calculated_volume").notNull(),
  calculatedWeight: real("calculated_weight").notNull(),
  quality: text("quality", { enum: ["excellent", "good", "fair", "poor"] }).notNull().default("good"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMeasurementSchema = createInsertSchema(measurements).omit({
  id: true,
  createdAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertMeasurement = z.infer<typeof insertMeasurementSchema>;
export type Measurement = typeof measurements.$inferSelect;

export const COAL_TYPES = {
  anthracite: { name: "Anthracite", density: 1500 },
  bituminous: { name: "Bituminous Coal", density: 1300 },
  "sub-bituminous": { name: "Sub-bituminous Coal", density: 1200 },
  lignite: { name: "Lignite", density: 1100 },
  coking: { name: "Coking Coal", density: 1350 },
  thermal: { name: "Thermal Coal", density: 1250 },
} as const;

export const VOLUME_METHODS = {
  "truncated-pyramid": {
    name: "Truncated Pyramid",
    accuracy: 90,
    calculate: (l: number, w: number, h: number) => (l * w * h) / 3 * 1.5,
  },
  ellipsoid: {
    name: "Ellipsoid Approximation",
    accuracy: 85,
    calculate: (l: number, w: number, h: number) => (4 / 3) * Math.PI * (l / 2) * (w / 2) * (h / 2) * 0.6,
  },
  conical: {
    name: "Conical Approximation",
    accuracy: 80,
    calculate: (l: number, w: number, h: number) => (1 / 3) * Math.PI * (l / 2) * (w / 2) * h,
  },
  rectangular: {
    name: "Rectangular with Fill Factor",
    accuracy: 75,
    calculate: (l: number, w: number, h: number) => l * w * h * 0.52,
  },
} as const;
