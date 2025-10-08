from fastapi import APIRouter

router = APIRouter(prefix="/jobs", tags=["jobs"])


from fastapi import UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
import os, shutil, uuid
from app.deps import get_db
from app.models import Job
from app.tasks import run_meshroom_job, compute_volume
from app.config import settings

UPLOAD_DIR = settings.UPLOAD_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/")
def submit_job(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    # TODO: Implement proper authentication middleware
    # user_id: int = Depends(get_current_user_id)
):
    # Temporary: Use a default user_id until auth is implemented
    user_id = 1
    # Validate file type and size
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    # Check file extension
    allowed_extensions = {'.zip', '.mp4', '.avi', '.mov', '.jpg', '.jpeg', '.png'}
    file_ext = os.path.splitext(file.filename.lower())[1]
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: zip, mp4, avi, mov, jpg, jpeg, png")
    
    # Check file size (max 100MB)
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    if file_size > 100 * 1024 * 1024:  # 100MB
        raise HTTPException(status_code=400, detail="File too large. Maximum size: 100MB")
    
    # Save uploaded file (image zip or video)
    job_uuid = str(uuid.uuid4())
    user_dir = os.path.join(UPLOAD_DIR, f"user_{user_id}")
    os.makedirs(user_dir, exist_ok=True)
    
    # Use UUID-based filename to prevent path traversal and collisions
    original_ext = os.path.splitext(file.filename)[1].lower()
    safe_ext = original_ext if original_ext in {'.zip', '.mp4', '.avi', '.mov', '.jpg', '.jpeg', '.png'} else ''
    safe_name = f"{job_uuid}{safe_ext}"
    file_path = os.path.join(user_dir, safe_name)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Create DB job entry
    job = Job(user_id=user_id, status="pending")
    db.add(job)
    db.commit()
    db.refresh(job)

    # Trigger Meshroom job via Celery
    run_meshroom_job.delay(job.id, file_path)

    return {"job_id": job.id, "status": "submitted"}

@router.get("/")
def list_jobs():
    # TODO: List jobs for user
    return {"jobs": []}
