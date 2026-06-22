import os
from dotenv import load_dotenv
import tempfile

load_dotenv()

class Settings:
    PROJECT_NAME: str = "Coal Pile Measurement Backend"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/coal_db")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "supersecret")  # TODO: Generate secure random key in production
    MESHROOM_PATH: str = os.getenv("MESHROOM_PATH", "/usr/local/bin/meshroom_batch")
    CLOUDCOMPARE_PATH: str = os.getenv("CLOUDCOMPARE_PATH", "/usr/local/bin/CloudCompare")
    GPU_ENABLED: bool = os.getenv("GPU_ENABLED", "true").lower() == "true"
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", os.path.join(tempfile.gettempdir(), "coal_uploads"))
    RESULTS_DIR: str = os.getenv("RESULTS_DIR", os.path.join(tempfile.gettempdir(), "coal_results"))
    MESHROOM_TIMEOUT: int = int(os.getenv("MESHROOM_TIMEOUT", "3600"))
    COAL_DENSITY: float = float(os.getenv("COAL_DENSITY", 1300.0))  # kg/m^3
    FRAME_EXTRACTION_INTERVAL: float = float(os.getenv("FRAME_EXTRACTION_INTERVAL", 1.0))
    
    # GPU Configuration
    GPU_MEMORY_LIMIT_PERCENT: float = float(os.getenv("GPU_MEMORY_LIMIT_PERCENT", "0.9"))
    MAX_CONCURRENT_GPU_JOBS: int = int(os.getenv("MAX_CONCURRENT_GPU_JOBS", "2"))
    
    # Performance Tuning
    MAX_CONCURRENT_CPU_JOBS: int = int(os.getenv("MAX_CONCURRENT_CPU_JOBS", "4"))
    MIN_TIMEOUT_SECONDS: int = int(os.getenv("MIN_TIMEOUT_SECONDS", "600"))
    MAX_TIMEOUT_SECONDS: int = int(os.getenv("MAX_TIMEOUT_SECONDS", "7200"))
    TIMEOUT_BASE_SECONDS_PER_IMAGE: int = int(os.getenv("TIMEOUT_BASE_SECONDS_PER_IMAGE", "60"))
    
    # Cache Configuration
    CACHE_DIR: str = os.getenv("CACHE_DIR", os.path.join(tempfile.gettempdir(), "meshroom_cache"))
    CACHE_MAX_SIZE_GB: int = int(os.getenv("CACHE_MAX_SIZE_GB", "100"))
    CACHE_EXPIRATION_DAYS: int = int(os.getenv("CACHE_EXPIRATION_DAYS", "7"))
    
    # Quality Thresholds
    MIN_IMAGE_COUNT: int = int(os.getenv("MIN_IMAGE_COUNT", "8"))
    MIN_IMAGE_RESOLUTION_WIDTH: int = int(os.getenv("MIN_IMAGE_RESOLUTION_WIDTH", "640"))
    MIN_IMAGE_RESOLUTION_HEIGHT: int = int(os.getenv("MIN_IMAGE_RESOLUTION_HEIGHT", "480"))
    SHARPNESS_THRESHOLD: float = float(os.getenv("SHARPNESS_THRESHOLD", "100.0"))
    LOW_QUALITY_SCORE_THRESHOLD: int = int(os.getenv("LOW_QUALITY_SCORE_THRESHOLD", "50"))
    
    # Optimization
    MESH_VOLUME_TOLERANCE_PERCENT: float = float(os.getenv("MESH_VOLUME_TOLERANCE_PERCENT", "2.0"))
    MAX_HOLE_SIZE_PERCENT: float = float(os.getenv("MAX_HOLE_SIZE_PERCENT", "5.0"))
    OPTIMIZATION_TIME_LIMIT_PERCENT: float = float(os.getenv("OPTIMIZATION_TIME_LIMIT_PERCENT", "10.0"))
    
    # Retry Configuration
    MAX_RETRY_ATTEMPTS: int = int(os.getenv("MAX_RETRY_ATTEMPTS", "2"))
    RETRY_DELAY_SECONDS: int = int(os.getenv("RETRY_DELAY_SECONDS", "30"))

settings = Settings()