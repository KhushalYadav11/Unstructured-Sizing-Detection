# 3D Model Measurement System - File Overview

This document explains which files are responsible for sizing and measurement of 3D models in the Coal Assessment system.

## Core Measurement Files

### 1. **Server-Side Processing**

#### `server/mesh-processor.ts` ⭐ PRIMARY MEASUREMENT ENGINE
**Purpose**: Core calculation engine for volume, dimensions, and weight

**Key Functions**:
- `parseObjFile()` - Extracts vertices and faces from OBJ files
- `calculateVolume()` - Calculates volume using divergence theorem (closed mesh required)
- `calculateSurfaceArea()` - Computes total surface area
- `calculateBoundingBox()` - Finds min/max coordinates (X, Y, Z)
- `extractDimensions()` - Derives length, width, height from bounding box
- `processObjFile()` - Main entry point that orchestrates all calculations

**Measurement Methods**:
```typescript
// Volume calculation using divergence theorem
// Requires closed/watertight mesh for accuracy
volume = ∑(signed tetrahedron volumes from centroid)

// Bounding box dimensions
length = max.x - min.x
width = max.y - min.y  
height = max.z - min.z

// Weight calculation
weight = volume × coal_density
```

**Coal Density Configurations**:
- Anthracite: 1500 kg/m³
- Bituminous: 1300 kg/m³ (default)
- Sub-bituminous: 1200 kg/m³
- Lignite: 1100 kg/m³
- Coking: 1350 kg/m³
- Thermal: 1250 kg/m³

---

#### `backend/app/mesh_optimizer.py` ⭐ MESH QUALITY OPTIMIZER
**Purpose**: Repairs and optimizes mesh geometry while preserving volume

**Key Functions**:
- `optimize_mesh()` - Main optimization pipeline
- `remove_duplicates_and_degenerates()` - Cleans up mesh topology
- `fill_small_holes()` - Fills holes < 5% of surface area
- `smooth_mesh()` - Applies Laplacian smoothing (3 iterations)
- `apply_convex_hull_fallback()` - Fallback for non-watertight meshes

**Optimization Pipeline**:
1. Remove duplicate vertices and degenerate faces
2. Fill small holes (< 5% surface area)
3. Apply Laplacian smoothing (3 iterations)
4. Verify volume change < 2% tolerance
5. If non-watertight → convex hull fallback

**Volume Preservation**:
- Maximum allowed volume change: 2% (configurable via `MESH_VOLUME_TOLERANCE_PERCENT`)
- Tracks before/after volume to ensure accuracy

---

### 2. **API Routes**

#### `server/routes.ts` - Measurement Endpoints

**`POST /api/mesh/process-by-url`** ⭐ MAIN MEASUREMENT API
- Accepts mesh URL and coal type
- Calls `meshProcessor.processObjFile()` to compute measurements
- Returns: volume, weight, dimensions, surface area, bounding box

**`POST /api/mesh/process/:fileId`**
- Processes uploaded mesh files
- Creates measurement record in database
- Associates with project

**`POST /api/mesh/upload`**
- Handles mesh file uploads
- Validates file format
- Stores in uploads directory

---

### 3. **Client-Side Integration**

#### `client/src/lib/mesh-api.ts` ⭐ CLIENT API WRAPPER
**Purpose**: Frontend functions to interact with measurement APIs

**Key Functions**:
- `uploadMeshFile()` - Uploads 3D model files
- `processMesh()` - Triggers measurement calculation
- `processMeshByUrl()` - Processes mesh from URL (used after reconstruction)
- `getCoalTypes()` - Fetches available coal density options
- `saveMeasurement()` - Saves measurement to project

**Example Usage**:
```typescript
// After 3D reconstruction completes
const result = await processMeshByUrl(modelUrl, 'bituminous');
// Returns: { volume, weight, dimensions, boundingBox, ... }
```

---

#### `client/src/components/3DReconstruction.tsx`
**Purpose**: Displays reconstruction progress and triggers analysis

**Key Code**:
```typescript
const onAnalyze = async () => {
  if (!modelUrl) return;
  setAnalyzing(true);
  const res = await processMeshByUrl(modelUrl);
  setAnalysis(res);
  // Displays: volume, weight, dimensions
};
```

---

#### `client/src/components/ThreeDViewer.tsx`
**Purpose**: Interactive 3D viewer with measurement tools

**Features**:
- Manual measurement points
- Volume calculation mode
- Distance/area measurements
- Bounding box visualization

**Volume Calculation**:
```typescript
const calculateVolume = (points: THREE.Vector3[]) => {
  if (points.length < 4) return 0;
  // Convex hull volume calculation
  // Used for manual point-based measurements
};
```

---

#### `client/src/components/MeasurementPanel.tsx`
**Purpose**: UI for inputting dimensions and calculating weight

**Features**:
- Manual dimension input (length, width, height)
- Coal type selection
- Weight calculation: `weight = volume × density`
- Multiple volume calculation methods

---

#### `client/src/components/VolumeMethodCard.tsx`
**Purpose**: Displays volume calculation method and results

**Calculation Methods**:
1. **3D Mesh** - From reconstructed model (most accurate)
2. **Manual Points** - User-selected points in viewer
3. **Manual Dimensions** - User input L × W × H

---

### 4. **Database Schema**

#### `shared/schema.ts` - Measurement Data Structure
```typescript
interface Measurement {
  id: string;
  projectId: string;
  length: number;
  width: number;
  height: number;
  unit: string;
  coalType: string;
  coalDensity: number;
  volumeMethod: string;          // "3D_MESH" | "MANUAL" | etc.
  calculatedVolume: number;      // m³
  calculatedWeight: number;      // kg
  quality: "excellent" | "good" | "fair" | "poor";
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Measurement Flow Diagram

### Automated Flow (After 3D Reconstruction):

```
1. NodeODM completes reconstruction
   ↓
2. Mesh file saved: /uploads/projects/{id}/reconstruction/odm_textured_model_geo.obj
   ↓
3. User clicks "Analyze Dimensions & Weight"
   ↓
4. Frontend: processMeshByUrl(modelUrl, coalType)
   ↓
5. API: POST /api/mesh/process-by-url
   ↓
6. Server: meshProcessor.processObjFile(filePath, coalType)
   ↓
7. Calculations:
   - parseObjFile() → vertices, faces
   - calculateVolume() → divergence theorem
   - calculateBoundingBox() → min/max coords
   - extractDimensions() → length, width, height
   - weight = volume × density
   ↓
8. Return to frontend: { volume, weight, dimensions, ... }
   ↓
9. Display in UI
```

---

### Manual Flow (User Input):

```
1. User navigates to Measurement page
   ↓
2. Selects volume method: "Manual Dimensions"
   ↓
3. Inputs: length, width, height
   ↓
4. Selects coal type (density)
   ↓
5. Client calculates: volume = L × W × H
   ↓
6. Client calculates: weight = volume × density
   ↓
7. User saves measurement
   ↓
8. API: POST /api/projects/{id}/measurements
   ↓
9. Stored in database
```

---

## Key Algorithms

### Volume Calculation (Divergence Theorem)

```typescript
// For a closed mesh, volume is the signed sum of tetrahedrons
// formed from each triangle face to the centroid
let volume = 0;
const centroid = calculateCentroid(vertices);

for (const face of faces) {
  const [a, b, c] = [vertices[face[0]], vertices[face[1]], vertices[face[2]]];
  
  // Translate to centroid
  const a' = a - centroid;
  const b' = b - centroid;
  const c' = c - centroid;
  
  // Signed tetrahedron volume
  const signed = (a' · (b' × c')) / 6;
  volume += signed;
}

return Math.abs(volume);
```

**Requirements**:
- Mesh must be **closed/watertight**
- Faces must have consistent winding order
- No holes or gaps in geometry

**Why This Matters for Quality**:
If your reconstructed mesh has holes or is fragmented (like your previous result), the volume calculation will be **inaccurate or fail completely**.

---

### Bounding Box Dimensions

```typescript
// Find min and max coordinates
const bbox = {
  min: { x: min(vertices.x), y: min(vertices.y), z: min(vertices.z) },
  max: { x: max(vertices.x), y: max(vertices.y), z: max(vertices.z) }
};

// Dimensions are simply the differences
const dimensions = {
  length: bbox.max.x - bbox.min.x,
  width: bbox.max.y - bbox.min.y,
  height: bbox.max.z - bbox.min.z
};
```

**Note**: Bounding box dimensions represent the **maximum extents**, not the actual shape. For irregular shapes like coal piles, this may overestimate.

---

### Surface Area Calculation

```typescript
// Sum of all triangle face areas
let surfaceArea = 0;

for (const face of faces) {
  const [v0, v1, v2] = [vertices[face[0]], vertices[face[1]], vertices[face[2]]];
  
  // Triangle area using cross product
  const edge1 = v1 - v0;
  const edge2 = v2 - v0;
  const cross = edge1 × edge2;
  const magnitude = |cross|;
  
  surfaceArea += magnitude / 2;
}

return surfaceArea;
```

---

## Configuration Files

### Environment Variables (`.env`)

```bash
# Coal measurement
COAL_DENSITY=1300.0  # Default density in kg/m³

# Mesh optimization
MESH_VOLUME_TOLERANCE_PERCENT=2.0      # Max volume change during optimization
MAX_HOLE_SIZE_PERCENT=5.0              # Max hole size to auto-fill
OPTIMIZATION_TIME_LIMIT_PERCENT=10.0   # Max optimization time vs reconstruction
```

---

## Accuracy Considerations

### What Affects Measurement Accuracy:

1. **Mesh Quality** ⭐ MOST IMPORTANT
   - Closed/watertight mesh = accurate volume
   - Holes/gaps = inaccurate or failed calculation
   - Fragmented geometry = unusable

2. **Reconstruction Quality**
   - Better input photos → better mesh → accurate measurements
   - Poor photos → fragmented mesh → inaccurate measurements

3. **Scale/Units**
   - Photogrammetry produces unitless coordinates
   - Scale must be calibrated (using reference objects)
   - Without calibration, measurements are relative

4. **Coal Density Selection**
   - Different coal types have different densities
   - Correct type selection is critical for weight accuracy
   - Volume is unaffected, only weight changes

---

## Quality Indicators

### When Measurements Are Reliable:

✅ Mesh is watertight (`mesh.is_watertight === true`)
✅ Volume > 0
✅ Bounding box dimensions are reasonable
✅ Surface area proportional to volume
✅ No extreme outlier vertices
✅ Face count > 1000 (sufficient detail)

### When Measurements Are Unreliable:

❌ Mesh is not watertight (holes, gaps)
❌ Volume = 0 or negative
❌ Extreme bounding box dimensions
❌ Very low face count (< 100 faces)
❌ Fragmented geometry (like your previous result)
❌ Multiple disconnected components

---

## Debugging Measurements

### Check Mesh Quality:
```bash
# In Python console
import trimesh
mesh = trimesh.load('model.obj')
print(f"Watertight: {mesh.is_watertight}")
print(f"Volume: {mesh.volume}")
print(f"Vertices: {len(mesh.vertices)}")
print(f"Faces: {len(mesh.faces)}")
print(f"Bounding box: {mesh.bounds}")
```

### Check Server Logs:
```bash
# Look for these messages
"Processing mesh: /path/to/model.obj"
"Vertices found: N"
"Faces found: N"
"Calculated volume: N m³"
"Calculated weight: N kg"
```

### Check API Response:
```javascript
// In browser console
fetch('/api/mesh/process-by-url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    meshUrl: '/uploads/projects/.../model.obj',
    coalType: 'bituminous'
  })
})
.then(r => r.json())
.then(console.log);
```

---

## Improving Measurement Accuracy

### 1. Improve Reconstruction Quality
- Follow photography best practices (see `PHOTOGRAMMETRY_BEST_PRACTICES.md`)
- Ensure 70-80% image overlap
- Take 100+ images from multiple heights
- Use consistent lighting

### 2. Use Mesh Optimization
- Enable mesh optimization in settings
- Repairs holes and improves topology
- Preserves volume within 2% tolerance

### 3. Add Scale Reference
- Include object of known size in photos
- Use ground control points with GPS coordinates
- Calibrate using measurement tool

### 4. Validate Results
- Compare mesh volume with bounding box volume
- Check if surface area is reasonable
- Verify mesh is watertight
- Cross-check with manual measurements

---

## Summary

**Primary Files for Measurement**:
1. `server/mesh-processor.ts` - Volume, dimensions, weight calculations
2. `backend/app/mesh_optimizer.py` - Mesh repair and optimization
3. `server/routes.ts` - API endpoints
4. `client/src/lib/mesh-api.ts` - Frontend API wrapper

**Key Algorithm**: Divergence theorem for volume (requires closed mesh)

**Critical Success Factor**: **Mesh quality** is everything - a fragmented mesh produces inaccurate or failed measurements. Focus on improving reconstruction quality first (good input photos with proper overlap).

**Next Steps**:
1. Retake photos following best practices
2. Generate high-quality reconstruction
3. Verify mesh is watertight
4. Run measurements with confidence
