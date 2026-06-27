# Coal Pile Measurement — Python/Meshroom Research Backend

> **Note:** This Python backend is a standalone research pipeline and is **not connected to the main web application**. The active web app runs on Node.js (`server/`) and uses **NodeODM** for reconstruction. See the root-level documentation for the full system setup.

---

## What This Is

This directory contains a high-quality photogrammetry pipeline built with **FastAPI + Celery + Redis + PostgreSQL + Meshroom CLI**. It was developed as a research alternative to NodeODM, targeting Polycam-level reconstruction quality through careful parameter tuning.

It is useful for:
- Offline batch processing of large image sets
- Experimenting with Meshroom quality parameters
- Running independent quality benchmarks

---

## Components

| Component | File | Purpose |
|-----------|------|---------|
| `ImagePreprocessor` | `app/image_preprocessor.py` | EXIF rotation, dedup, exposure normalisation, resolution cap |
| `InputAnalyzer` | `app/input_analyzer.py` | Validates image count, resolution, sharpness, overlap |
| `ParameterOptimizer` | `app/parameter_optimizer.py` | Selects Meshroom preset (fast/balanced/quality) by image count + resolution |
| `MeshroomPipelineBuilder` | `app/meshroom_pipeline.py` | Builds optimised `--overrides` JSON for Meshroom CLI |
| `GPUAccelerator` | `app/gpu_accelerator.py` | Manages CUDA device selection and CPU fallback |
| `ProgressTracker` | `app/progress_tracker.py` | Parses Meshroom stdout for stage/progress |
| `TimeoutManager` | `app/timeout_manager.py` | Adaptive timeout (600–7200 s) based on image count |
| `CacheManager` | `app/cache_manager.py` | SHA256-keyed stage caching, 7-day expiry, 100 GB limit |
| `QualityValidator` | `app/quality_validator.py` | Scores mesh 0–100, flags < 50 as low quality |
| `MeshOptimizer` | `app/mesh_optimizer.py` | Taubin smoothing, hole fill, degenerate removal, convex hull fallback |
| `ErrorHandler` | `app/error_handler.py` | Categorises Meshroom errors, determines retry eligibility |
| `PerformanceMonitor` | `app/performance_monitor.py` | Records per-stage timings and peak resource usage |

---

## Meshroom Pipeline Quality Settings

The `MeshroomPipelineBuilder` passes a `--overrides` JSON to Meshroom that tunes every major quality lever:

### Feature Extraction
- Descriptor: `sift` (fast) or `sift_float` (balanced/quality)
- Contrast threshold: 0.04 (low) → 0.005 (ultra)
- Max features per image: 5,000 → 40,000

### Depth Maps (MVS — biggest quality lever)
- SGM scale/step: 2 (fast) → 1 (quality)
- Sub-pixel refinement enabled on high/ultra
- Min consistent views: 2 (fast) → 4 (quality)

### Meshing
- Max input points: 10M → 50M
- Output mesh points: 500K → 2M

### Mesh Filtering
- Smoothing iterations: 3 → 7
- Large triangle outlier removal

### Texturing
- Resolution: 2048 → 8192
- Hole filling enabled
- 10–15 diffuse samples

---

## Setup

### Prerequisites
- Python 3.10+
- Meshroom installed (download from [alicevision.org](https://alicevision.org))
- Redis and PostgreSQL running
- NVIDIA GPU with CUDA (optional but recommended)

### Installation

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — set DATABASE_URL, REDIS_URL, MESHROOM_PATH
```

### Environment Variables

```env
# Core
DATABASE_URL=postgresql://user:password@localhost/coal_db
REDIS_URL=redis://localhost:6379/0
MESHROOM_PATH=/usr/local/bin/meshroom_batch

# GPU
GPU_ENABLED=true

# Quality thresholds
MIN_IMAGE_COUNT=8
MIN_IMAGE_RESOLUTION_WIDTH=640
MIN_IMAGE_RESOLUTION_HEIGHT=480
SHARPNESS_THRESHOLD=100.0

# Timeouts
MIN_TIMEOUT_SECONDS=600
MAX_TIMEOUT_SECONDS=7200
TIMEOUT_BASE_SECONDS_PER_IMAGE=60

# Cache
CACHE_DIR=/tmp/meshroom_cache
CACHE_MAX_SIZE_GB=100
CACHE_EXPIRATION_DAYS=7

# Mesh optimisation
MESH_VOLUME_TOLERANCE_PERCENT=2.0
MAX_HOLE_SIZE_PERCENT=5.0

# Retry
MAX_RETRY_ATTEMPTS=2
RETRY_DELAY_SECONDS=30
```

### Running

```bash
# API server
uvicorn app.main:app --reload

# Celery worker (priority queues)
celery -A app.worker worker --loglevel=info \
  -Q meshroom_high,meshroom_medium,meshroom_low
```

---

## Running Tests

```bash
# All tests
python -m pytest tests/ -v

# Specific components
python -m pytest tests/test_input_analyzer.py -v
python -m pytest tests/test_parameter_optimizer.py -v
python -m pytest tests/test_mesh_optimizer.py -v

# Property-based tests (uses Hypothesis)
python -m pytest tests/test_*_properties.py -v
```

All 19 correctness properties pass. Test suite covers unit tests, property-based tests, and integration tests for the complete workflow.

---

## Key Design Decisions

**Why Taubin smoothing instead of Laplacian?**
Laplacian smoothing shrinks the mesh — each iteration moves vertices toward the average of their neighbours, reducing volume. Taubin alternates between a λ pass (forward) and a μ pass (backward, |μ| > λ), cancelling the shrinkage. The volume guard (`> 2%` change → revert) provides an additional safety net.

**Why pre-load textures manually instead of relying on MTLLoader?**
Three.js `MTLLoader` creates `MeshPhongMaterial` which goes dark when combined with bump maps and specular settings from photogrammetry software. The `ImagePreprocessor` and viewer both bypass this by loading textures directly via `THREE.TextureLoader` and upgrading to `MeshStandardMaterial` for correct PBR rendering.

**Why is the Python backend separate from the Node.js app?**
NodeODM runs in Docker and requires no Python dependencies — it's easier to deploy and run on Windows. The Python/Meshroom pipeline requires Meshroom to be installed (Linux/macOS native) and is better suited to research/batch workflows. The two pipelines produce compatible OBJ output.
