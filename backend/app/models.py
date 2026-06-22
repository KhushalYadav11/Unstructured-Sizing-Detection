from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from app.db import Base
import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_client = Column(Boolean, default=True)
    jobs = relationship("Job", back_populates="owner")

class Job(Base):
    __tablename__ = "jobs"
    
    # Existing fields
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String, default="pending", index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    model_path = Column(String)
    volume = Column(Float)
    weight = Column(Float)
    length = Column(Float)
    width = Column(Float)
    height = Column(Float)
    
    # New fields for optimization
    current_stage = Column(String)
    progress_percent = Column(Float, default=0.0)
    estimated_remaining_seconds = Column(Integer)
    
    # Input analysis
    input_analysis = Column(JSON)
    
    # Parameters used
    meshroom_parameters = Column(JSON)
    
    # Quality metrics
    quality_score = Column(Integer, index=True)
    quality_metrics = Column(JSON)
    
    # Optimization result
    optimization_result = Column(JSON)
    
    # Performance metrics
    processing_time_seconds = Column(Float)
    stage_timings = Column(JSON)
    peak_cpu_percent = Column(Float)
    peak_ram_mb = Column(Float)
    peak_gpu_memory_mb = Column(Float)
    used_gpu = Column(Boolean, default=False)
    
    # Preview model
    preview_model_path = Column(String)
    preview_ready_at = Column(DateTime)
    
    # Retry tracking
    retry_count = Column(Integer, default=0)
    retry_history = Column(JSON)
    
    # Error diagnostics
    failure_type = Column(String, index=True)
    error_details = Column(JSON)
    
    owner = relationship("User", back_populates="jobs")

class CachedStage(Base):
    __tablename__ = "cached_stages"
    
    id = Column(Integer, primary_key=True, index=True)
    image_hash = Column(String, index=True)
    parameters_hash = Column(String, index=True)
    stage_name = Column(String)
    output_path = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    size_bytes = Column(Integer)
    last_accessed = Column(DateTime, default=datetime.datetime.utcnow)
