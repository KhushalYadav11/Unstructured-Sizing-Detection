import fs from 'fs';
import path from 'path';
import { calculatePileVolume, type DsmVolumeResult } from './dsm-volume.js';

export interface MeshProcessingResult {
  volume: number;          // m³ (best estimate)
  weight: number;          // kg
  vertices: number;
  faces: number;
  surfaceArea: number;     // m²
  boundingBox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  // Extended accuracy fields
  volumeMethod: "dsm-ground-subtraction" | "divergence-theorem-fallback";
  volumeConfidence: "high" | "medium" | "low";
  groundPlaneZ?: number;
  pileArea?: number;       // footprint m²
  maxHeight?: number;      // max height above ground m
}

export interface CoalDensityConfig {
  type: string;
  density: number; // kg/m³
}

export const COAL_DENSITIES: Record<string, CoalDensityConfig> = {
  anthracite: { type: 'Anthracite', density: 1500 },
  bituminous: { type: 'Bituminous Coal', density: 1300 },
  'sub-bituminous': { type: 'Sub-bituminous Coal', density: 1200 },
  lignite: { type: 'Lignite', density: 1100 },
  coking: { type: 'Coking Coal', density: 1350 },
  thermal: { type: 'Thermal Coal', density: 1250 },
};

export class MeshProcessor {
  /**
   * Parse OBJ file and extract vertices and faces
   */
  private parseObjFile(filePath: string): { vertices: number[][]; faces: number[][] } {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const vertices: number[][] = [];
    const triangles: number[][] = [];

    const parseIndex = (token: string): number => {
      const raw = parseInt(token.split('/')[0], 10);
      if (Number.isNaN(raw)) return -1;
      if (raw > 0) return raw - 1;
      const idx = vertices.length + raw; // negative indices are relative to end
      return idx;
    };

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('v ')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 4) {
          const x = parseFloat(parts[1]);
          const y = parseFloat(parts[2]);
          const z = parseFloat(parts[3]);
          vertices.push([x, y, z]);
        }
      } else if (trimmed.startsWith('f ')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 4) {
          const indices: number[] = [];
          for (let i = 1; i < parts.length; i++) {
            const idx = parseIndex(parts[i]);
            if (idx >= 0) indices.push(idx);
          }
          if (indices.length >= 3) {
            for (let i = 1; i < indices.length - 1; i++) {
              triangles.push([indices[0], indices[i], indices[i + 1]]);
            }
          }
        }
      }
    }

    return { vertices, faces: triangles };
  }

  /**
   * Calculate volume using the divergence theorem (mesh must be closed)
   */
  private calculateVolume(vertices: number[][], faces: number[][]): number {
    if (vertices.length === 0 || faces.length === 0) return 0;
    const bbox = this.calculateBoundingBox(vertices);
    const cx = (bbox.min.x + bbox.max.x) / 2;
    const cy = (bbox.min.y + bbox.max.y) / 2;
    const cz = (bbox.min.z + bbox.max.z) / 2;

    let volume = 0;
    for (const f of faces) {
      const a = vertices[f[0]];
      const b = vertices[f[1]];
      const c = vertices[f[2]];
      if (!a || !b || !c) continue;
      const ax = a[0] - cx, ay = a[1] - cy, az = a[2] - cz;
      const bx = b[0] - cx, by = b[1] - cy, bz = b[2] - cz;
      const cx2 = c[0] - cx, cy2 = c[1] - cy, cz2 = c[2] - cz;
      const signed = (ax * (by * cz2 - bz * cy2) + bx * (cy2 * az - cz2 * ay) + cx2 * (ay * bz - az * by)) / 6;
      volume += signed;
    }
    return Math.abs(volume);
  }

  /**
   * Calculate surface area of the mesh
   */
  private calculateSurfaceArea(vertices: number[][], faces: number[][]): number {
    let surfaceArea = 0;
    
    for (const face of faces) {
      if (face.length >= 3) {
        const v0 = vertices[face[0]];
        const v1 = vertices[face[1]];
        const v2 = vertices[face[2]];
        
        if (v0 && v1 && v2) {
          // Calculate triangle area using cross product
          const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
          const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
          
          const cross = [
            edge1[1] * edge2[2] - edge1[2] * edge2[1],
            edge1[2] * edge2[0] - edge1[0] * edge2[2],
            edge1[0] * edge2[1] - edge1[1] * edge2[0]
          ];
          
          const magnitude = Math.sqrt(cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);
          surfaceArea += magnitude / 2;
        }
      }
    }
    
    return surfaceArea;
  }

  /**
   * Calculate bounding box of the mesh
   */
  private calculateBoundingBox(vertices: number[][]) {
    if (vertices.length === 0) {
      return {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 }
      };
    }
    
    let minX = vertices[0][0], maxX = vertices[0][0];
    let minY = vertices[0][1], maxY = vertices[0][1];
    let minZ = vertices[0][2], maxZ = vertices[0][2];
    
    for (const vertex of vertices) {
      minX = Math.min(minX, vertex[0]);
      maxX = Math.max(maxX, vertex[0]);
      minY = Math.min(minY, vertex[1]);
      maxY = Math.max(maxY, vertex[1]);
      minZ = Math.min(minZ, vertex[2]);
      maxZ = Math.max(maxZ, vertex[2]);
    }
    
    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ }
    };
  }

  /**
   * Extract dimensions from bounding box
   */
  private extractDimensions(boundingBox: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }) {
    return {
      length: Math.abs(boundingBox.max.x - boundingBox.min.x),
      width: Math.abs(boundingBox.max.y - boundingBox.min.y),
      height: Math.abs(boundingBox.max.z - boundingBox.min.z)
    };
  }

  /**
   * Process OBJ file and calculate volume and weight.
   * Uses DSM-based ground-subtraction for accuracy on outdoor piles,
   * falling back to divergence theorem for indoor / pre-clipped meshes.
   */
  async processObjFile(
    filePath: string,
    coalType: string = 'bituminous',
    scaleFactor: number = 1.0,  // metres per mesh unit; 1.0 = GPS-referenced or already in metres
  ): Promise<MeshProcessingResult> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Parse for classic metrics (surface area, bounding box, vertex/face count)
      const { vertices, faces } = this.parseObjFile(filePath);

      if (vertices.length === 0 || faces.length === 0) {
        throw new Error('Invalid OBJ file: No vertices or faces found');
      }

      // Apply scale factor to all vertex coordinates before any calculations
      const scaledVertices = scaleFactor === 1.0
        ? vertices
        : vertices.map(v => [v[0] * scaleFactor, v[1] * scaleFactor, v[2] * scaleFactor]);

      const surfaceArea    = this.calculateSurfaceArea(scaledVertices, faces);
      const boundingBox    = this.calculateBoundingBox(scaledVertices);
      const dimensions     = this.extractDimensions(boundingBox);

      // --- Improved volume: DSM ground-subtraction (operates on scaled coords via scaleFactor param) ---
      const dsmResult: DsmVolumeResult = calculatePileVolume(content, scaleFactor);

      // If the DSM method returned near-zero (degenerate mesh), fall back
      const classicVolume = this.calculateVolume(scaledVertices, faces);
      const useDsm = dsmResult.volume > classicVolume * 0.05;
      const volume = useDsm ? dsmResult.volume : classicVolume;

      const coalConfig = COAL_DENSITIES[coalType] || COAL_DENSITIES.bituminous;
      const weight = volume * coalConfig.density;

      return {
        volume,
        weight,
        vertices: vertices.length,
        faces: faces.length,
        surfaceArea,
        boundingBox,
        dimensions,
        volumeMethod: useDsm ? dsmResult.method : "divergence-theorem-fallback",
        volumeConfidence: useDsm ? dsmResult.confidence : "medium",
        groundPlaneZ: dsmResult.groundPlaneZ,
        pileArea: dsmResult.pileArea,
        maxHeight: dsmResult.maxHeight,
      };
    } catch (error) {
      throw new Error(`Failed to process OBJ file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate if file is a valid OBJ file
   */
  validateObjFile(filePath: string): boolean {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      let hasVertices = false;
      let hasFaces = false;
      let vertexCount = 0;
      let faceCount = 0;
      
      // Check entire file for vertices and faces
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('v ')) {
          hasVertices = true;
          vertexCount++;
        }
        if (trimmed.startsWith('f ')) {
          hasFaces = true;
          faceCount++;
        }
      }
      
      console.log(`OBJ Validation for ${filePath}:`);
      console.log(`  Total lines: ${lines.length}`);
      console.log(`  Vertices found: ${vertexCount}`);
      console.log(`  Faces found: ${faceCount}`);
      console.log(`  Valid: ${hasVertices && hasFaces}`);
      
      return hasVertices && hasFaces;
    } catch (error) {
      console.error(`OBJ Validation error for ${filePath}:`, error);
      return false;
    }
  }
}

export const meshProcessor = new MeshProcessor();
