# Quick Reference: Files Used for 3D Model Sizing & Measurement

## 🎯 Core Measurement Files (What You Need to Know)

### Primary Calculation Engine
```
server/mesh-processor.ts
```
**What it does**: 
- Calculates volume using divergence theorem
- Extracts dimensions from bounding box (length, width, height)
- Computes surface area
- Calculates weight (volume × coal density)

**Key functions you might modify**:
- `calculateVolume()` - Volume calculation algorithm
- `calculateBoundingBox()` - Min/max coordinates
- `extractDimensions()` - Derives L×W×H from bounding box
- `COAL_DENSITIES` - Coal type density values

---

### Mesh Quality Optimizer (Python)
```
backend/app/mesh_optimizer.py
```
**What it does**:
- Repairs holes in mesh
- Removes duplicate vertices
- Smooths geometry
- Ensures volume accuracy (within 2% tolerance)

**When it's used**: After reconstruction to improve mesh quality before measurement

---

### API Endpoints
```
server/routes.ts
```
**Key endpoints**:
- `POST /api/mesh/process-by-url` - Main measurement API
- `POST /api/mesh/upload` - Upload mesh files
- `POST /api/mesh/process/:fileId` - Process uploaded files

---

### Client API Wrapper
```
client/src/lib/mesh-api.ts
```
**What it does**: Frontend functions to call measurement APIs
- `processMeshByUrl()` - Trigger measurement calculation
- `uploadMeshFile()` - Upload 3D models
- `getCoalTypes()` - Get available coal densities

---

## 🔧 Configuration Files

### Environment Variables
```
backend/.env or Coal-estimates/.env
```
**Relevant settings**:
```bash
COAL_DENSITY=1300.0                    # Default coal density (kg/m³)
MESH_VOLUME_TOLERANCE_PERCENT=2.0      # Max volume change during optimization
```

---

## 📊 Data Schema

### Database Schema
```
shared/schema.ts
```
**Measurement fields**:
- `calculatedVolume` - Volume in m³
- `calculatedWeight` - Weight in kg
- `length`, `width`, `height` - Dimensions in meters
- `coalDensity` - Density used for weight calculation

---

## 🎨 UI Components (Display Only)

### Display Measurement Results
```
client/src/components/3DReconstruction.tsx  - Shows analysis button & results
client/src/components/MeasurementPanel.tsx   - Manual measurement input
client/src/components/VolumeMethodCard.tsx   - Volume calculation display
client/src/components/ThreeDViewer.tsx       - Interactive measurement tools
```

---

## 🔍 How It All Works Together

```
1. User uploads images → 3D Reconstruction
   ↓
2. NodeODM generates mesh → /uploads/projects/{id}/reconstruction/model.obj
   ↓
3. User clicks "Analyze Dimensions & Weight"
   ↓
4. Frontend calls: processMeshByUrl(modelUrl, coalType)
   ↓
5. API: POST /api/mesh/process-by-url
   ↓
6. server/mesh-processor.ts:
   - parseObjFile() → extract vertices & faces
   - calculateVolume() → divergence theorem
   - calculateBoundingBox() → min/max coordinates
   - extractDimensions() → length, width, height
   - weight = volume × coalDensity
   ↓
7. Returns: { volume, weight, dimensions, surfaceArea, boundingBox }
   ↓
8. Frontend displays results
```

---

## ⚠️ Critical Requirements for Accurate Measurements

### The mesh MUST be:
- ✅ **Closed/Watertight** (no holes, no gaps)
- ✅ **Single solid object** (not fragmented)
- ✅ **Sufficient detail** (1000+ faces minimum)

### If the mesh is fragmented (like your previous result):
- ❌ Volume calculation will fail or be inaccurate
- ❌ Measurements will be unreliable
- ❌ Need to improve reconstruction quality first

**Solution**: Follow `PHOTOGRAMMETRY_BEST_PRACTICES.md` to generate a solid, watertight mesh

---

## 🛠️ Common Modifications

### Change Coal Densities
**File**: `server/mesh-processor.ts`
```typescript
export const COAL_DENSITIES: Record<string, CoalDensityConfig> = {
  anthracite: { type: 'Anthracite', density: 1500 },    // ← Modify here
  bituminous: { type: 'Bituminous Coal', density: 1300 },
  // Add new types here
  'my-custom-coal': { type: 'Custom', density: 1400 },
};
```

---

### Change Volume Calculation Algorithm
**File**: `server/mesh-processor.ts`
**Function**: `calculateVolume()`

Current method: Divergence theorem (signed tetrahedron volumes)
Alternative: Monte Carlo sampling, voxelization, convex hull

---

### Adjust Optimization Tolerance
**File**: `backend/.env`
```bash
MESH_VOLUME_TOLERANCE_PERCENT=2.0  # Change to allow more/less variation
MAX_HOLE_SIZE_PERCENT=5.0          # Max hole size to auto-repair
```

---

## 📖 Detailed Documentation

For complete technical details, see:
- `MEASUREMENT_SYSTEM_OVERVIEW.md` - Full system documentation
- `RECONSTRUCTION_QUALITY_GUIDE.md` - Quality settings
- `PHOTOGRAMMETRY_BEST_PRACTICES.md` - How to get good measurements

---

## 🆘 Troubleshooting

### "Volume is 0 or null"
→ Mesh is not watertight (has holes/gaps)
→ Solution: Improve reconstruction quality or use mesh optimizer

### "Dimensions are wrong"
→ Scale issue - photogrammetry produces unitless measurements
→ Solution: Add reference object of known size in photos

### "Weight seems incorrect"
→ Check coal density selection
→ Verify volume is correct first

### "Measurement failed"
→ Check server logs for detailed error
→ Verify mesh file exists and is valid OBJ format
→ Try manual measurement as fallback

---

## 📍 Quick Command Reference

### Check if mesh is watertight:
```bash
# Python
python -c "import trimesh; m=trimesh.load('model.obj'); print(f'Watertight: {m.is_watertight}, Volume: {m.volume}')"
```

### Test measurement API:
```bash
# cURL
curl -X POST http://localhost:5000/api/mesh/process-by-url \
  -H "Content-Type: application/json" \
  -d '{"meshUrl":"/uploads/projects/xxx/reconstruction/model.obj","coalType":"bituminous"}'
```

### Check mesh file validity:
```bash
# Count vertices and faces
grep -c "^v " model.obj    # Vertex count
grep -c "^f " model.obj    # Face count
```

---

## Summary Table

| Purpose | Primary File | Language | When It Runs |
|---------|--------------|----------|--------------|
| Volume calculation | `server/mesh-processor.ts` | TypeScript | On "Analyze" button click |
| Mesh optimization | `backend/app/mesh_optimizer.py` | Python | After reconstruction (optional) |
| API endpoints | `server/routes.ts` | TypeScript | On HTTP requests |
| Client functions | `client/src/lib/mesh-api.ts` | TypeScript | Frontend user actions |
| Coal densities | `server/mesh-processor.ts` | TypeScript | During weight calculation |
| UI display | Various components in `client/src/components/` | React/TSX | Rendering |

---

**Bottom Line**: The measurement system is solid, but it requires a **high-quality, watertight mesh** to work properly. Your current issue is mesh quality (fragmented geometry), not the measurement code. Focus on improving reconstruction quality first!
