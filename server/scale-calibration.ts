/**
 * Scale calibration for photogrammetry models
 *
 * Polycam achieves real-world scale via:
 *  a) iPhone LiDAR (absolute scale, ±1 cm)
 *  b) GPS geo-referencing (±0.5 m without GCPs, ±2 cm with GCPs)
 *  c) Known-distance markers (a ruler / tape measure in the scene)
 *
 * This module implements (b) and (c) — the two methods available without LiDAR.
 *
 * The ODM-produced mesh is already in GPS-referenced metric units if the input
 * images carry GPS EXIF data. The scale factor defaults to 1.0 in that case.
 * When images lack GPS, the user can provide two points and their real-world
 * distance, and we compute and store a scale correction factor.
 */

export interface CalibrationPoint {
  x: number;   // mesh coordinate
  y: number;
  z: number;
}

export interface ScaleCalibrationInput {
  pointA: CalibrationPoint;
  pointB: CalibrationPoint;
  realWorldDistanceMeters: number;
}

export interface ScaleCalibrationResult {
  scaleFactor: number;         // multiply mesh distances by this to get metres
  measuredDistanceMesh: number;  // Euclidean distance in mesh units
  confidence: "gps" | "manual" | "uncalibrated";
  notes: string;
}

/**
 * Compute scale factor from two known points in the mesh and their real-world distance.
 * Typical use: measure a ruler or GCP target that appears in the photos.
 */
export function computeScaleFactor(input: ScaleCalibrationInput): ScaleCalibrationResult {
  const { pointA, pointB, realWorldDistanceMeters } = input;

  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;
  const dz = pointB.z - pointA.z;
  const meshDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (meshDist < 1e-10) {
    return {
      scaleFactor: 1.0,
      measuredDistanceMesh: 0,
      confidence: "uncalibrated",
      notes: "Points are identical — cannot compute scale",
    };
  }

  const scaleFactor = realWorldDistanceMeters / meshDist;

  return {
    scaleFactor,
    measuredDistanceMesh: meshDist,
    confidence: "manual",
    notes: `Scale factor ${scaleFactor.toFixed(6)} computed from ${meshDist.toFixed(4)} mesh units = ${realWorldDistanceMeters} m`,
  };
}

/**
 * Apply scale factor to a volume measurement.
 * Volume scales as cube of the linear scale factor.
 */
export function applyScaleToVolume(volumeMeshUnits: number, scaleFactor: number): number {
  return volumeMeshUnits * Math.pow(scaleFactor, 3);
}

/**
 * Check if the images likely have GPS data (returned from EXIF extraction).
 * If yes, ODM will auto-scale the model — no manual calibration needed.
 */
export function hasGpsCalibration(photos: Array<{ exif?: { gps?: { lat: number; lng: number } | null } | null }>): boolean {
  return photos.some(p => p.exif?.gps?.lat != null && p.exif?.gps?.lng != null);
}

/**
 * Estimate reconstruction accuracy based on image count, GPS availability,
 * and whether manual calibration was applied.
 */
export function estimateAccuracy(
  imageCount: number,
  hasGps: boolean,
  hasManualCalibration: boolean,
  featureQuality: "ultra" | "high" | "medium" | "low"
): {
  linearAccuracyPercent: number;
  volumeAccuracyPercent: number;
  description: string;
} {
  let base = 10; // % error baseline for no GPS, medium quality

  if (featureQuality === "ultra") base -= 3;
  else if (featureQuality === "high") base -= 1.5;

  if (imageCount > 150) base -= 2;
  else if (imageCount > 80) base -= 1;
  else if (imageCount < 30) base += 4;

  if (hasGps) base -= 3;
  if (hasManualCalibration) base -= 2;

  const linear = Math.max(0.5, base);
  // Volume error ≈ 3× linear error (cubed relationship)
  const volume = Math.max(1, linear * 2.5);

  let description = "";
  if (linear <= 1.5) description = "Survey-grade (±1.5%) — excellent for coal inventory";
  else if (linear <= 3)  description = "High accuracy (±3%) — suitable for stock management";
  else if (linear <= 6)  description = "Moderate accuracy (±6%) — add GPS or more images";
  else description = "Low accuracy (±10%+) — improve image coverage and add GPS";

  return { linearAccuracyPercent: parseFloat(linear.toFixed(1)), volumeAccuracyPercent: parseFloat(volume.toFixed(1)), description };
}
