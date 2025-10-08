import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  status: text("status", { enum: ["draft", "processing", "completed"] }).notNull().default("draft"),
  // 3D Model dimensions extracted from uploaded .obj file
  length: real("length"),
  width: real("width"),
  height: real("height"),
  volume: real("volume"),
  meshFileName: text("mesh_file_name"),
  meshFilePath: text("mesh_file_path"),
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

// Coal types with densities (kg/m³)
export const COAL_TYPES = {
  anthracite: { name: "Anthracite", density: 1500 },
  bituminous: { name: "Bituminous Coal", density: 1300 },
  "sub-bituminous": { name: "Sub-bituminous Coal", density: 1200 },
  lignite: { name: "Lignite", density: 1100 },
  coking: { name: "Coking Coal", density: 1350 },
  thermal: { name: "Thermal Coal", density: 1250 },
} as const;

// Volume calculation methods
export const VOLUME_METHODS = {
  "truncated-pyramid": {
    name: "Truncated Pyramid",
    accuracy: 90,
    calculate: (l: number, w: number, h: number) => (l * w * h) / 3 * 1.5, // Approximation
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
    calculate: (l: number, w: number, h: number) => l * w * h * 0.52, // Fill factor
  },
} as const;
