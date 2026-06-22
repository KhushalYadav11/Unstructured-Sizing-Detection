# Database Migrations

This directory contains database migration scripts for the Coal Pile Measurement Backend.

## Migration 001: Add Optimization Fields

**File:** `001_add_optimization_fields.py`

**Purpose:** Adds support for the Meshroom Performance Optimization feature by extending the Job model and creating the CachedStage table.

### Changes

#### Job Model Extensions
- **Progress Tracking:** `current_stage`, `progress_percent`, `estimated_remaining_seconds`
- **Input Analysis:** `input_analysis` (JSONB)
- **Parameters:** `meshroom_parameters` (JSONB)
- **Quality Metrics:** `quality_score`, `quality_metrics` (JSONB)
- **Optimization:** `optimization_result` (JSONB)
- **Performance Metrics:** `processing_time_seconds`, `stage_timings` (JSONB), `peak_cpu_percent`, `peak_ram_mb`, `peak_gpu_memory_mb`, `used_gpu`
- **Preview Model:** `preview_model_path`, `preview_ready_at`
- **Retry Tracking:** `retry_count`, `retry_history` (JSONB)
- **Error Diagnostics:** `failure_type`, `error_details` (JSONB)

#### New Table: CachedStage
Stores intermediate Meshroom processing results for job resumption.

**Fields:**
- `id` (Primary Key)
- `image_hash` (VARCHAR, indexed)
- `parameters_hash` (VARCHAR, indexed)
- `stage_name` (VARCHAR)
- `output_path` (VARCHAR)
- `created_at` (TIMESTAMP, indexed)
- `size_bytes` (BIGINT)
- `last_accessed` (TIMESTAMP)

### Running Migrations

**Upgrade (apply migration):**
```bash
cd Coal-estimates/backend
python migrations/001_add_optimization_fields.py upgrade
```

**Downgrade (rollback migration):**
```bash
cd Coal-estimates/backend
python migrations/001_add_optimization_fields.py downgrade
```

### Prerequisites

- PostgreSQL database must be running
- Database connection configured in `.env` file or environment variables
- Required Python packages installed (`sqlalchemy`, `psycopg2-binary`)

### Notes

- The migration script is idempotent - it can be run multiple times safely
- Existing columns are skipped if they already exist
- The script provides detailed output showing which operations succeeded
- Both upgrade and downgrade operations are wrapped in transactions
