/**
 * Image validation utilities for photogrammetry
 * Helps identify common issues before processing
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";

export interface ImageValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  stats: {
    totalImages: number;
    validImages: number;
    totalSizeMB: number;
    avgResolution: { width: number; height: number };
    minResolution: { width: number; height: number };
    maxResolution: { width: number; height: number };
  };
}

export interface ImageInfo {
  path: string;
  width: number;
  height: number;
  format: string;
  sizeMB: number;
  isValid: boolean;
  issues: string[];
}

const MIN_RESOLUTION = 1920 * 1080; // Minimum 1080p
const RECOMMENDED_MIN_IMAGES = 50;
const ABSOLUTE_MIN_IMAGES = 20;

/**
 * Validate a set of images for photogrammetry
 */
export async function validateImages(imagePaths: string[]): Promise<ImageValidationResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const imageInfos: ImageInfo[] = [];

  // Check image count
  if (imagePaths.length < ABSOLUTE_MIN_IMAGES) {
    errors.push(
      `Only ${imagePaths.length} images provided. Minimum ${ABSOLUTE_MIN_IMAGES} required for reconstruction.`
    );
  } else if (imagePaths.length < RECOMMENDED_MIN_IMAGES) {
    warnings.push(
      `Only ${imagePaths.length} images provided. Recommended minimum is ${RECOMMENDED_MIN_IMAGES} for good quality.`
    );
  }

  // Analyze each image
  for (const imgPath of imagePaths) {
    try {
      if (!fs.existsSync(imgPath)) {
        errors.push(`Image not found: ${path.basename(imgPath)}`);
        continue;
      }

      const metadata = await sharp(imgPath).metadata();
      const stats = fs.statSync(imgPath);
      const sizeMB = stats.size / (1024 * 1024);

      const info: ImageInfo = {
        path: imgPath,
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format || "unknown",
        sizeMB,
        isValid: true,
        issues: [],
      };

      // Check resolution
      const pixels = info.width * info.height;
      if (pixels < MIN_RESOLUTION) {
        info.issues.push(
          `Low resolution: ${info.width}x${info.height} (minimum 1920x1080 recommended)`
        );
        info.isValid = false;
      }

      // Check if image is too small (likely corrupted or thumbnail)
      if (sizeMB < 0.1) {
        info.issues.push(`File size too small (${sizeMB.toFixed(2)}MB) - may be corrupted`);
        info.isValid = false;
      }

      // Check format
      if (!["jpeg", "jpg", "png", "tiff", "tif"].includes(metadata.format || "")) {
        info.issues.push(`Unsupported format: ${metadata.format}`);
        info.isValid = false;
      }

      imageInfos.push(info);

      // Add issues to warnings/errors
      if (info.issues.length > 0) {
        warnings.push(`${path.basename(imgPath)}: ${info.issues.join(", ")}`);
      }
    } catch (err) {
      errors.push(
        `Failed to read image ${path.basename(imgPath)}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // Calculate stats
  const validImages = imageInfos.filter((i) => i.isValid);
  const totalSizeMB = imageInfos.reduce((sum, i) => sum + i.sizeMB, 0);

  const avgWidth =
    validImages.reduce((sum, i) => sum + i.width, 0) / (validImages.length || 1);
  const avgHeight =
    validImages.reduce((sum, i) => sum + i.height, 0) / (validImages.length || 1);

  const minWidth = Math.min(...validImages.map((i) => i.width));
  const minHeight = Math.min(...validImages.map((i) => i.height));
  const maxWidth = Math.max(...validImages.map((i) => i.width));
  const maxHeight = Math.max(...validImages.map((i) => i.height));

  // Check for resolution consistency
  const resolutionVariance =
    Math.abs(maxWidth - minWidth) / avgWidth + Math.abs(maxHeight - minHeight) / avgHeight;
  if (resolutionVariance > 0.2) {
    warnings.push(
      `Inconsistent image resolutions detected. All images should be the same resolution for best results.`
    );
  }

  // Final validation
  const valid = errors.length === 0 && validImages.length >= ABSOLUTE_MIN_IMAGES;

  if (!valid && validImages.length < ABSOLUTE_MIN_IMAGES) {
    errors.push(
      `Only ${validImages.length} valid images found. Need at least ${ABSOLUTE_MIN_IMAGES}.`
    );
  }

  return {
    valid,
    warnings,
    errors,
    stats: {
      totalImages: imagePaths.length,
      validImages: validImages.length,
      totalSizeMB,
      avgResolution: { width: Math.round(avgWidth), height: Math.round(avgHeight) },
      minResolution: { width: minWidth, height: minHeight },
      maxResolution: { width: maxWidth, height: maxHeight },
    },
  };
}

/**
 * Generate a user-friendly validation report
 */
export function formatValidationReport(result: ImageValidationResult): string {
  const lines: string[] = [];

  lines.push("=== Image Validation Report ===\n");

  // Stats
  lines.push(`Total images: ${result.stats.totalImages}`);
  lines.push(`Valid images: ${result.stats.validImages}`);
  lines.push(
    `Average resolution: ${result.stats.avgResolution.width}x${result.stats.avgResolution.height}`
  );
  lines.push(`Total size: ${result.stats.totalSizeMB.toFixed(1)}MB\n`);

  // Errors
  if (result.errors.length > 0) {
    lines.push("❌ ERRORS:");
    result.errors.forEach((err) => lines.push(`  - ${err}`));
    lines.push("");
  }

  // Warnings
  if (result.warnings.length > 0) {
    lines.push("⚠️  WARNINGS:");
    result.warnings.forEach((warn) => lines.push(`  - ${warn}`));
    lines.push("");
  }

  // Result
  if (result.valid) {
    lines.push("✅ Images are valid for reconstruction");
    if (result.warnings.length > 0) {
      lines.push("   However, addressing warnings above will improve quality");
    }
  } else {
    lines.push("❌ Images are NOT valid for reconstruction");
    lines.push("   Please fix the errors above before proceeding");
  }

  return lines.join("\n");
}
