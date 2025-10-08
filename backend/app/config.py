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

settings = Settings()
