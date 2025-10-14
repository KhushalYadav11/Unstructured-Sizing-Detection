import fs from 'fs';
import path from 'path';

export interface MeshProcessingResult {
  volume: number; // m³
  weight: number; // kg
  vertices: number;
  faces: number;
  surfaceArea: number; // m²
  boundingBox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  dimensions: {
    length: number; // meters
    width: number; // meters
    height: number; // meters
  };
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
    const faces: number[][] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('v ')) {
        // Vertex line: v x y z
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 4) {
          vertices.push([
            parseFloat(parts[1]),
            parseFloat(parts[2]),
            parseFloat(parts[3])
          ]);
        }
      } else if (trimmed.startsWith('f ')) {
        // Face line: f v1 v2 v3 (1-indexed)
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 4) {
          const face = [];
          for (let i = 1; i < parts.length; i++) {
            // Handle face formats like "v/vt/vn" or just "v"
            const vertexIndex = parseInt(parts[i].split('/')[0]) - 1; // Convert to 0-indexed
            face.push(vertexIndex);
          }
          faces.push(face);
        }
      }
    }
    
    return { vertices, faces };
  }

  /**
   * Calculate volume using the divergence theorem (mesh must be closed)
   */
  private calculateVolume(vertices: number[][], faces: number[][]): number {
    let volume = 0;
    
    for (const face of faces) {
      if (face.length >= 3) {
        // For triangular faces, use the signed volume of tetrahedron
        const v0 = vertices[face[0]];
        const v1 = vertices[face[1]];
        const v2 = vertices[face[2]];
        
        if (v0 && v1 && v2) {
          // Calculate signed volume of tetrahedron formed by origin and triangle
          const signedVolume = (
            v0[0] * (v1[1] * v2[2] - v1[2] * v2[1]) +
            v1[0] * (v2[1] * v0[2] - v2[2] * v0[1]) +
            v2[0] * (v0[1] * v1[2] - v0[2] * v1[1])
          ) / 6;
          
          volume += signedVolume;
        }
      }
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
   * Process OBJ file and calculate volume and weight
   */
  async processObjFile(
    filePath: string, 
    coalType: string = 'bituminous'
  ): Promise<MeshProcessingResult> {
    try {
      // Parse the OBJ file
      const { vertices, faces } = this.parseObjFile(filePath);
      
      if (vertices.length === 0 || faces.length === 0) {
        throw new Error('Invalid OBJ file: No vertices or faces found');
      }
      
      // Calculate volume
      const volume = this.calculateVolume(vertices, faces);
      
      // Calculate surface area
      const surfaceArea = this.calculateSurfaceArea(vertices, faces);
      
      // Calculate bounding box
      const boundingBox = this.calculateBoundingBox(vertices);
      
      // Extract dimensions
      const dimensions = this.extractDimensions(boundingBox);
      
      // Get coal density
      const coalConfig = COAL_DENSITIES[coalType] || COAL_DENSITIES.bituminous;
      
      // Calculate weight (volume in m³ × density in kg/m³)
      const weight = volume * coalConfig.density;
      
      return {
        volume,
        weight,
        vertices: vertices.length,
        faces: faces.length,
        surfaceArea,
        boundingBox,
        dimensions
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