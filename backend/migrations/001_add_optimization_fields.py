"""
Database migration script to add optimization fields to Job model and create CachedStage table.

This migration adds new fields to support the Meshroom Performance Optimization feature:
- Progress tracking fields (current_stage, progress_percent, estimated_remaining_seconds)
- Input analysis and parameter storage (input_analysis, meshroom_parameters)
- Quality metrics (quality_score, quality_metrics, optimization_result)
- Performance metrics (processing_time_seconds, stage_timings, resource usage)
- Preview model support (preview_model_path, preview_ready_at)
- Retry tracking (retry_count, retry_history)
- Error diagnostics (failure_type, error_details)

Also creates the CachedStage table for intermediate result caching.

Usage:
    python migrations/001_add_optimization_fields.py upgrade
    python migrations/001_add_optimization_fields.py downgrade
"""

import sys
import os
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError

# Add parent directory to path to import config
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.config import settings


def upgrade(engine):
    """Apply migration - add new fields to jobs table and create cached_stages table."""
    print("Running upgrade migration...")
    
    with engine.begin() as conn:
        # Add new fields to jobs table
        print("Adding new fields to jobs table...")
        
        # Progress tracking
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN current_stage VARCHAR(50)"))
            print("  ✓ Added current_stage")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - current_stage already exists, skipping")
            else:
                raise
        
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN progress_percent FLOAT DEFAULT 0.0"))
            print("  ✓ Added progress_percent")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - progress_percent already exists, skipping")
            else:
                raise
        
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN estimated_remaining_seconds INTEGER"))
            print("  ✓ Added estimated_remaining_seconds")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - estimated_remaining_seconds already exists, skipping")
            else:
                raise
        
        # Input analysis and parameters
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN input_analysis JSONB"))
            print("  ✓ Added input_analysis")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - input_analysis already exists, skipping")
            else:
                raise
        
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN meshroom_parameters JSONB"))
            print("  ✓ Added meshroom_parameters")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - meshroom_parameters already exists, skipping")
            else:
                raise
        
        # Quality metrics
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN quality_score INTEGER"))
            print("  ✓ Added quality_score")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - quality_score already exists, skipping")
            else:
                raise
        
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN quality_metrics JSONB"))
            print("  ✓ Added quality_metrics")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - quality_metrics already exists, skipping")
            else:
                raise
        
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN optimization_result JSONB"))
            print("  ✓ Added optimization_result")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - optimization_result already exists, skipping")
            else:
                raise
        
        # Performance metrics
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN processing_time_seconds FLOAT"))
            print("  ✓ Added processing_time_seconds")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - processing_time_seconds already exists, skipping")
            else:
                raise
        
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN stage_timings JSONB"))
            print("  ✓ Added stage_timings")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - stage_timings already exists, skipping")
            else:
                raise
        
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN peak_cpu_percent FLOAT"))
            print("  ✓ Added peak_cpu_percent")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - peak_cpu_percent already exists, skipping")
            else:
                raise
        
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN peak_ram_mb FLOAT"))
            print("  ✓ Added peak_ram_mb")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - peak_ram_mb already exists, skipping")
            else:
                raise
        
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN peak_gpu_memory_mb FLOAT"))
            print("  ✓ Added peak_gpu_memory_mb")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - peak_gpu_memory_mb already exists, skipping")
            else:
                raise
        
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN used_gpu BOOLEAN DEFAULT FALSE"))
            print("  ✓ Added used_gpu")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - used_gpu already exists, skipping")
            else:
                raise
        
        # Preview model
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN preview_model_path VARCHAR(500)"))
            print("  ✓ Added preview_model_path")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - preview_model_path already exists, skipping")
            else:
                raise
        
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN preview_ready_at TIMESTAMP"))
            print("  ✓ Added preview_ready_at")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - preview_ready_at already exists, skipping")
            else:
                raise
        
        # Retry tracking
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN retry_count INTEGER DEFAULT 0"))
            print("  ✓ Added retry_count")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - retry_count already exists, skipping")
            else:
                raise
        
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN retry_history JSONB"))
            print("  ✓ Added retry_history")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - retry_history already exists, skipping")
            else:
                raise
        
        # Error diagnostics
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN failure_type VARCHAR(50)"))
            print("  ✓ Added failure_type")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - failure_type already exists, skipping")
            else:
                raise
        
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN error_details JSONB"))
            print("  ✓ Added error_details")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - error_details already exists, skipping")
            else:
                raise
        
        # Create indexes
        print("\nCreating indexes...")
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)"))
            print("  ✓ Created idx_jobs_status")
        except ProgrammingError as e:
            print(f"  - Index idx_jobs_status: {e}")
        
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_jobs_quality_score ON jobs(quality_score)"))
            print("  ✓ Created idx_jobs_quality_score")
        except ProgrammingError as e:
            print(f"  - Index idx_jobs_quality_score: {e}")
        
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_jobs_failure_type ON jobs(failure_type)"))
            print("  ✓ Created idx_jobs_failure_type")
        except ProgrammingError as e:
            print(f"  - Index idx_jobs_failure_type: {e}")
        
        # Create cached_stages table
        print("\nCreating cached_stages table...")
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS cached_stages (
                    id SERIAL PRIMARY KEY,
                    image_hash VARCHAR(64) NOT NULL,
                    parameters_hash VARCHAR(64) NOT NULL,
                    stage_name VARCHAR(50) NOT NULL,
                    output_path VARCHAR(500) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    size_bytes BIGINT NOT NULL,
                    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            print("  ✓ Created cached_stages table")
        except ProgrammingError as e:
            if "already exists" in str(e):
                print("  - cached_stages table already exists, skipping")
            else:
                raise
        
        # Create indexes for cached_stages
        print("\nCreating indexes for cached_stages...")
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cached_stages_lookup ON cached_stages(image_hash, parameters_hash)"))
            print("  ✓ Created idx_cached_stages_lookup")
        except ProgrammingError as e:
            print(f"  - Index idx_cached_stages_lookup: {e}")
        
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cached_stages_created ON cached_stages(created_at)"))
            print("  ✓ Created idx_cached_stages_created")
        except ProgrammingError as e:
            print(f"  - Index idx_cached_stages_created: {e}")
    
    print("\n✅ Migration upgrade completed successfully!")


def downgrade(engine):
    """Rollback migration - remove new fields and drop cached_stages table."""
    print("Running downgrade migration...")
    
    with engine.begin() as conn:
        # Drop cached_stages table
        print("Dropping cached_stages table...")
        try:
            conn.execute(text("DROP TABLE IF EXISTS cached_stages CASCADE"))
            print("  ✓ Dropped cached_stages table")
        except ProgrammingError as e:
            print(f"  - Error dropping cached_stages: {e}")
        
        # Remove indexes from jobs table
        print("\nDropping indexes from jobs table...")
        try:
            conn.execute(text("DROP INDEX IF EXISTS idx_jobs_status"))
            print("  ✓ Dropped idx_jobs_status")
        except ProgrammingError as e:
            print(f"  - Error dropping idx_jobs_status: {e}")
        
        try:
            conn.execute(text("DROP INDEX IF EXISTS idx_jobs_quality_score"))
            print("  ✓ Dropped idx_jobs_quality_score")
        except ProgrammingError as e:
            print(f"  - Error dropping idx_jobs_quality_score: {e}")
        
        try:
            conn.execute(text("DROP INDEX IF EXISTS idx_jobs_failure_type"))
            print("  ✓ Dropped idx_jobs_failure_type")
        except ProgrammingError as e:
            print(f"  - Error dropping idx_jobs_failure_type: {e}")
        
        # Remove columns from jobs table
        print("\nRemoving columns from jobs table...")
        columns_to_drop = [
            "current_stage", "progress_percent", "estimated_remaining_seconds",
            "input_analysis", "meshroom_parameters",
            "quality_score", "quality_metrics", "optimization_result",
            "processing_time_seconds", "stage_timings", "peak_cpu_percent",
            "peak_ram_mb", "peak_gpu_memory_mb", "used_gpu",
            "preview_model_path", "preview_ready_at",
            "retry_count", "retry_history",
            "failure_type", "error_details"
        ]
        
        for column in columns_to_drop:
            try:
                conn.execute(text(f"ALTER TABLE jobs DROP COLUMN IF EXISTS {column}"))
                print(f"  ✓ Dropped {column}")
            except ProgrammingError as e:
                print(f"  - Error dropping {column}: {e}")
    
    print("\n✅ Migration downgrade completed successfully!")


def main():
    """Main entry point for migration script."""
    if len(sys.argv) < 2:
        print("Usage: python 001_add_optimization_fields.py [upgrade|downgrade]")
        sys.exit(1)
    
    command = sys.argv[1].lower()
    if command not in ["upgrade", "downgrade"]:
        print("Error: Command must be 'upgrade' or 'downgrade'")
        sys.exit(1)
    
    # Create database engine
    print(f"Connecting to database: {settings.DATABASE_URL}")
    engine = create_engine(settings.DATABASE_URL)
    
    try:
        if command == "upgrade":
            upgrade(engine)
        else:
            downgrade(engine)
    except Exception as e:
        print(f"\n❌ Migration failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
