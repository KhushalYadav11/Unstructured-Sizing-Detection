from app.worker import celery_app
from app.config import settings
from app.db import SessionLocal
from app.models import Job
import os, subprocess, shutil
import trimesh
from typing import Optional

@celery_app.task
def run_meshroom_job(job_id: int, input_path: str):
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return {"error": "Job not found"}
        
        # Update job status to processing
        job.status = "processing"
        db.commit()
        # Prepare output dir
        output_dir = os.path.join(settings.RESULTS_DIR, f"job_{job_id}")
        os.makedirs(output_dir, exist_ok=True)

        # Validate Meshroom binary exists
        if not os.path.exists(settings.MESHROOM_PATH):
            job.status = "failed"
            db.commit()
            return {"error": f"Meshroom executable not found at {settings.MESHROOM_PATH}"}

        # Run Meshroom CLI with timeout and captured output
        meshroom_cmd = [settings.MESHROOM_PATH, "--input", input_path, "--output", output_dir]
        try:
            result = subprocess.run(
                meshroom_cmd,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=settings.MESHROOM_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            job.status = "failed"
            db.commit()
            return {"error": "Meshroom processing timed out"}
        except subprocess.CalledProcessError as e:
            job.status = "failed"
            db.commit()
            return {"error": f"Meshroom processing failed: {e.output}"}
        # Find .obj
        obj_path = os.path.join(output_dir, "texturedMesh.obj")
        if not os.path.exists(obj_path):
            # fallback: search for any .obj
            for root, _, files in os.walk(output_dir):
                for f in files:
                    if f.endswith(".obj"):
                        obj_path = os.path.join(root, f)
                        break
        if not os.path.exists(obj_path):
            job.status = "failed"
            job.model_path = None
            db.commit()
            return {"error": "No 3D model generated"}
        
        # Update job with model path
        job.model_path = obj_path
        job.status = "reconstructed"
        db.commit()
        
        # Trigger volume calculation
        compute_volume.delay(job_id, obj_path)
        return {"status": "success", "model_path": obj_path}
        
    except subprocess.CalledProcessError as e:
        job.status = "failed"
        job.model_path = None
        db.commit()
        return {"error": f"Meshroom processing failed: {str(e)}"}
    except Exception as e:
        job.status = "failed"
        job.model_path = None
        db.commit()
        return {"error": f"Unexpected error: {str(e)}"}
    finally:
        db.close()

@celery_app.task
def compute_volume(job_id: int, obj_path: str):
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return {"error": "Job not found"}
        
        if not os.path.exists(obj_path):
            job.status = "failed"
            db.commit()
            return {"error": "Model file not found"}
        # Use Trimesh for volume calculation with robustness
        mesh: Optional[trimesh.Trimesh]
        try:
            mesh = trimesh.load(obj_path, force='mesh')  # force mesh interpretation
        except Exception as e:
            return {"error": f"Failed to load mesh: {str(e)}"}

        if not isinstance(mesh, trimesh.Trimesh):
            return {"error": "Loaded object is not a mesh"}

        volume = float(mesh.volume) if hasattr(mesh, 'volume') else 0.0
        if (not mesh.is_watertight) or volume <= 0:
            # Fallback: use convex hull for an approximate volume
            try:
                hull = mesh.convex_hull
                volume = float(hull.volume) if hasattr(hull, 'volume') else 0.0
            except Exception:
                volume = 0.0

        bounds = mesh.bounding_box.extents
        length, width, height = [float(x) for x in bounds.tolist()]
        # Estimate weight
        # settings.COAL_DENSITY is in kg/m^3; volume in m^3 → weight in kg
        weight = float(volume) * float(settings.COAL_DENSITY)
        job.volume = volume
        job.length = length
        job.width = width
        job.height = height
        job.weight = weight
        job.status = "complete"
        db.commit()
        return {"status": "success", "volume": volume, "weight": weight}
        
    except Exception as e:
        job.status = "failed"
        db.commit()
        return {"error": f"Volume calculation failed: {str(e)}"}
    finally:
        db.close()
