# 3D Reconstruction Quality Optimization Guide

This guide helps you improve the quality of 3D reconstructions from photogrammetry.

## Quick Fix: Update Your Settings

The reconstruction quality is now configurable via environment variables. Copy these settings to your `.env` file (or update `backend/.env`):

```bash
# High Quality Settings (Recommended)
NODE_ODM_FEATURE_QUALITY=ultra
NODE_ODM_PC_QUALITY=ultra
NODE_ODM_MESH_SIZE=500000
NODE_ODM_MIN_NUM_FEATURES=10000
NODE_ODM_MATCHER_NEIGHBORS=12
NODE_ODM_MESH_OCTREE_DEPTH=11
```

After updating, restart your server for changes to take effect.

## Quality Presets

### Fast (Low Quality)
Best for: Quick previews, testing
Processing time: ~5-10 minutes for 20 images

```bash
NODE_ODM_FEATURE_QUALITY=low
NODE_ODM_PC_QUALITY=low
NODE_ODM_MESH_SIZE=100000
NODE_ODM_MIN_NUM_FEATURES=4000
NODE_ODM_MATCHER_NEIGHBORS=6
NODE_ODM_MESH_OCTREE_DEPTH=9
```

### Balanced (Medium Quality) - Default
Best for: Most use cases
Processing time: ~15-30 minutes for 20 images

```bash
NODE_ODM_FEATURE_QUALITY=high
NODE_ODM_PC_QUALITY=high
NODE_ODM_MESH_SIZE=300000
NODE_ODM_MIN_NUM_FEATURES=8000
NODE_ODM_MATCHER_NEIGHBORS=10
NODE_ODM_MESH_OCTREE_DEPTH=10
```

### High Quality (Recommended for Coal Piles)
Best for: Accurate measurements, detailed models
Processing time: ~30-60 minutes for 20 images

```bash
NODE_ODM_FEATURE_QUALITY=ultra
NODE_ODM_PC_QUALITY=ultra
NODE_ODM_MESH_SIZE=500000
NODE_ODM_MIN_NUM_FEATURES=10000
NODE_ODM_MATCHER_NEIGHBORS=12
NODE_ODM_MESH_OCTREE_DEPTH=11
```

### Maximum Quality
Best for: Critical measurements, publication-quality models
Processing time: ~1-3 hours for 20 images

```bash
NODE_ODM_FEATURE_QUALITY=ultra
NODE_ODM_PC_QUALITY=ultra
NODE_ODM_MESH_SIZE=1000000
NODE_ODM_MIN_NUM_FEATURES=15000
NODE_ODM_MATCHER_NEIGHBORS=16
NODE_ODM_MESH_OCTREE_DEPTH=12
```

## Parameter Explanations

### Feature Quality
Controls how many features (distinctive points) are detected in each image.
- **ultra**: Best feature detection, slowest
- **high**: Good balance
- **medium**: Faster but may miss details
- **low/lowest**: Fast but poor quality

### Point Cloud Quality
Controls the density of the 3D point cloud generated from matched features.
- **ultra**: Densest point cloud, best for complex shapes
- **high**: Good detail
- **medium**: Adequate for simple shapes
- **low/lowest**: Sparse, may have holes

### Mesh Size
Number of triangles in the final 3D mesh.
- **1,000,000+**: Very detailed, large files
- **500,000**: Good detail, manageable size (recommended)
- **200,000**: Basic detail, small files
- **100,000**: Low detail, very small files

### Min Num Features
Minimum features to detect per image.
- **15,000+**: Best matching, slowest
- **10,000**: Good matching (recommended)
- **8,000**: Adequate
- **4,000**: Fast but may fail on textureless areas

### Matcher Neighbors
How many neighboring images to match against each image.
- **16+**: Best coverage, slowest
- **12**: Good coverage (recommended)
- **8**: Adequate
- **6**: Fast but may miss connections

### Mesh Octree Depth
Controls mesh resolution (9-14).
- **12-14**: Extremely fine detail
- **11**: Fine detail (recommended)
- **10**: Good detail
- **9**: Basic detail

## Photography Tips for Better Results

Even with the best settings, poor photos will produce poor models. Follow these tips:

### 1. Image Overlap
- **Minimum**: 60% overlap between consecutive images
- **Recommended**: 70-80% overlap
- Take more photos rather than fewer

### 2. Lighting
- Avoid harsh shadows (overcast days are ideal)
- Consistent lighting across all photos
- Avoid shooting into the sun

### 3. Camera Settings
- Use the highest resolution your camera supports
- Keep ISO low (100-400) to minimize noise
- Use a fast shutter speed to avoid motion blur
- Manual focus is better than autofocus

### 4. Coverage
- Capture the object from all angles
- Include photos from high, medium, and low angles
- Walk around the entire object in a circle
- Take additional photos of complex areas

### 5. Image Quality
- Avoid blurry images
- Avoid over/underexposed images
- Keep the camera steady (use a tripod if possible)
- Minimum resolution: 1920x1080 (Full HD)
- Recommended: 4K or higher

### 6. What to Avoid
- Moving objects in the scene
- Reflective surfaces (wet coal, metal)
- Transparent objects
- Textureless surfaces (uniform colors)
- Extreme lighting changes between photos

## Troubleshooting Poor Quality

### Problem: Fragmented/Disconnected Mesh
**Causes:**
- Not enough image overlap
- Too few images
- Poor feature matching

**Solutions:**
- Increase `NODE_ODM_MATCHER_NEIGHBORS` to 16
- Increase `NODE_ODM_MIN_NUM_FEATURES` to 15000
- Take more photos with better overlap

### Problem: Holes in the Mesh
**Causes:**
- Insufficient coverage
- Textureless areas
- Low point cloud density

**Solutions:**
- Increase `NODE_ODM_PC_QUALITY` to ultra
- Increase `NODE_ODM_MESH_OCTREE_DEPTH` to 12
- Take additional photos of problem areas

### Problem: Noisy/Rough Surface
**Causes:**
- Low-quality images
- High ISO noise
- Poor lighting

**Solutions:**
- Use better quality images
- Increase `NODE_ODM_FEATURE_QUALITY` to ultra
- Retake photos with better lighting

### Problem: Incorrect Scale/Dimensions
**Causes:**
- Lack of reference objects
- Poor camera calibration

**Solutions:**
- Include objects of known size in photos
- Use a calibration target
- Ensure consistent camera settings

## Performance vs Quality Trade-offs

| Setting | Processing Time | Quality | File Size | Use Case |
|---------|----------------|---------|-----------|----------|
| Fast | 5-10 min | Low | Small | Testing |
| Balanced | 15-30 min | Medium | Medium | General use |
| High | 30-60 min | High | Large | Measurements |
| Maximum | 1-3 hours | Excellent | Very Large | Critical work |

## Hardware Requirements

### Minimum
- 8 GB RAM
- 4 CPU cores
- 20 GB free disk space

### Recommended for High Quality
- 16 GB RAM
- 8 CPU cores
- 50 GB free disk space
- GPU with 4+ GB VRAM (optional, speeds up processing)

### For Maximum Quality
- 32 GB RAM
- 16 CPU cores
- 100 GB free disk space
- GPU with 8+ GB VRAM

## Next Steps

1. Update your `.env` file with the desired quality settings
2. Restart the server: `npm run dev` (or restart Docker container)
3. Upload new images following the photography tips
4. Start a new reconstruction job
5. Compare the results

For more information on NodeODM parameters, see:
https://docs.opendronemap.org/arguments/
