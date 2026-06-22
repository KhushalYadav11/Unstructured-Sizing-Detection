# Coal Pile Measurement Backend

This backend uses FastAPI, Celery, Redis, and PostgreSQL. It is designed for photogrammetry-based coal pile measurement, job queueing, and client management.

## Features
- User authentication and client portal
- Image/video upload for 3D reconstruction
- Meshroom CLI integration for photogrammetry with GPU acceleration
- Adaptive parameter selection based on input characteristics
- Real-time progress tracking and intermediate results
- Intelligent timeout management with graceful degradation
- Mesh quality validation and automatic repair
- Intermediate result caching for job resumption
- Multi-resolution processing (preview + full model)
- Automatic retry with parameter adjustment
- Performance benchmarking and monitoring
- Trimesh/CloudCompare integration for volume calculation
- Job queue with Celery + Redis (priority-based ordering)
- PostgreSQL for persistent storage
- PDF/CSV report generation
- REST API for frontend integration

## Setup (Development)

1. Clone the repo and enter the backend directory.
2. Create a Python virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy and configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```
5. Start Redis and PostgreSQL (Docker recommended).
6. Run database migrations:
   ```bash
   python migrations/001_add_optimization_fields.py upgrade
   ```
7. Run the FastAPI server:
   ```bash
   uvicorn app.main:app --reload
   ```
8. Start Celery worker with priority queues:
   ```bash
   celery -A app.worker worker --loglevel=info \
     -Q meshroom_high,meshroom_medium,meshroom_low
   ```

## Configuration

Copy `.env.example` to `.env` and configure the following settings:

### Core Settings
| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `SECRET_KEY` | — | JWT secret key |
| `MESHROOM_PATH` | `/usr/local/bin/meshroom_batch` | Path to Meshroom CLI |
| `RESULTS_DIR` | `/tmp/coal_results` | Output directory for reconstructions |

### GPU Acceleration
| Variable | Default | Description |
|----------|---------|-------------|
| `GPU_ENABLED` | `true` | Enable GPU acceleration |
| `GPU_MEMORY_LIMIT_PERCENT` | `0.9` | Max GPU memory fraction (fallback at 90%) |
| `MAX_CONCURRENT_GPU_JOBS` | `2` | Max concurrent GPU jobs |
| `MAX_CONCURRENT_CPU_JOBS` | `4` | Max concurrent CPU-only jobs |

### Timeout Management
| Variable | Default | Description |
|----------|---------|-------------|
| `TIMEOUT_BASE_SECONDS_PER_IMAGE` | `60` | Base seconds per image for timeout |
| `MIN_TIMEOUT_SECONDS` | `600` | Minimum job timeout (10 min) |
| `MAX_TIMEOUT_SECONDS` | `7200` | Maximum job timeout (2 hours) |

### Caching
| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_DIR` | `/tmp/meshroom_cache` | Intermediate result cache directory |
| `CACHE_MAX_SIZE_GB` | `100` | Maximum cache size in GB |
| `CACHE_EXPIRATION_DAYS` | `7` | Cache entry expiration in days |

### Input Validation
| Variable | Default | Description |
|----------|---------|-------------|
| `MIN_IMAGE_COUNT` | `8` | Minimum images required |
| `MIN_IMAGE_RESOLUTION_WIDTH` | `640` | Minimum image width |
| `MIN_IMAGE_RESOLUTION_HEIGHT` | `480` | Minimum image height |
| `SHARPNESS_THRESHOLD` | `100.0` | Laplacian variance blur threshold |

### Quality & Optimization
| Variable | Default | Description |
|----------|---------|-------------|
| `LOW_QUALITY_SCORE_THRESHOLD` | `50` | Score below this flags low quality |
| `MESH_VOLUME_TOLERANCE_PERCENT` | `2.0` | Max volume change after optimization |
| `MAX_HOLE_SIZE_PERCENT` | `5.0` | Max hole size to auto-fill |

### Retry Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_RETRY_ATTEMPTS` | `2` | Maximum automatic retries |
| `RETRY_DELAY_SECONDS` | `30` | Delay between retries |

## New API Endpoints

### Job Progress
```
GET /jobs/{job_id}/progress
```
Returns current processing stage and completion percentage.

### Quality Metrics
```
GET /jobs/{job_id}/quality
```
Returns quality score and detailed mesh quality metrics.

### Preview Model
```
GET /jobs/{job_id}/preview
```
Returns preview model path when available.

### Manual Retry
```
POST /jobs/{job_id}/retry
```
Manually triggers a retry for a failed job.

### Performance Metrics
```
GET /metrics/performance
```
Returns aggregated performance metrics across all completed jobs.

## Running Tests

```bash
# Run all tests
python -m pytest tests/ -v

# Run specific test modules
python -m pytest tests/test_input_analyzer.py -v
python -m pytest tests/test_parameter_optimizer.py -v
python -m pytest tests/test_gpu_accelerator.py -v
python -m pytest tests/test_progress_tracker.py -v
python -m pytest tests/test_timeout_manager.py -v
python -m pytest tests/test_quality_validator.py -v
python -m pytest tests/test_mesh_optimizer.py -v
python -m pytest tests/test_cache_manager.py -v
python -m pytest tests/test_workflow_integration.py -v

# Run property-based tests
python -m pytest tests/test_*_properties.py -v
```

## Architecture

The optimization introduces eight new components:

1. **Input_Analyzer** — Validates images before processing
2. **Parameter_Optimizer** — Selects optimal Meshroom parameters
3. **GPU_Accelerator** — Manages GPU resources and CPU fallback
4. **Progress_Tracker** — Monitors and reports processing stages
5. **Timeout_Manager** — Adaptive timeout with graceful degradation
6. **Cache_Manager** — Stores intermediate results for resumption
7. **Quality_Validator** — Assesses mesh quality (0-100 score)
8. **Mesh_Optimizer** — Repairs and optimizes meshes post-reconstruction

All components integrate into the existing Celery task workflow without breaking changes.
