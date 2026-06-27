from app.worker import celery_app
from app.config import settings
from app.db import SessionLocal
from app.models import Job
from app.input_analyzer import InputAnalyzer
from app.parameter_optimizer import ParameterOptimizer
from app.gpu_accelerator import GPUAccelerator
from app.timeout_manager import TimeoutManager
from app.progress_tracker import ProgressTracker
from app.cache_manager import CacheManager
from app.quality_validator import QualityValidator
from app.mesh_optimizer import MeshOptimizer
from app.error_handler import ErrorHandler
from app.performance_monitor import PerformanceMonitor
from app.meshroom_pipeline import MeshroomPipelineBuilder
from app.image_preprocessor import ImagePreprocessor
import os
import shutil
import subprocess
import threading
import time
import traceback
import trimesh
from typing import Optional


def _monitor_progress(process, tracker: ProgressTracker, timeout_config, cache_mgr: CacheManager):
    """Thread target: reads Meshroom stdout and updates progress."""
    timeout_mgr = TimeoutManager()
    start = time.time()
    for line in iter(process.stdout.readline, ""):
        update = tracker.parse_meshroom_output(line.rstrip())
        if update:
            tracker.update_progress(update)
        elapsed = int(time.time() - start)
        if timeout_mgr.check_timeout_warning(elapsed, timeout_config):
            break
        if tracker.detect_stall():
            break


def _collect_stderr(process) -> str:
    """Drain process stderr into a string (used when stderr is a separate pipe)."""
    if process.stderr is None:
        return ""
    lines = []
    for line in iter(process.stderr.readline, ""):
        lines.append(line.rstrip())
    return "\n".join(lines)


def _find_output_mesh(output_dir: str) -> Optional[str]:
    """
    Search for the best output mesh in output_dir.
    Prefers the textured/filtered mesh over raw outputs.
    """
    # Preferred order: MeshFiltering output > Meshing output > any .obj
    preferred_dirs = ["MeshFiltering", "Texturing", "Meshing"]
    for preferred in preferred_dirs:
        for root, dirs, files in os.walk(output_dir):
            if preferred.lower() in root.lower():
                for fname in files:
                    if fname.endswith(".obj"):
                        return os.path.join(root, fname)

    # Fallback: first .obj found
    for root, _, files in os.walk(output_dir):
        for fname in files:
            if fname.endswith(".obj"):
                return os.path.join(root, fname)
    return None


def _build_meshroom_env(gpu_config) -> dict:
    """Build environment variables for Meshroom subprocess."""
    env = os.environ.copy()
    if gpu_config.enabled:
        env["CUDA_VISIBLE_DEVICES"] = str(gpu_config.device_id)
    else:
        env["CUDA_VISIBLE_DEVICES"] = ""
    return env


@celery_app.task(bind=True, max_retries=2)
def run_meshroom_job(self, job_id: int, input_path: str):
    db = SessionLocal()
    perf_monitor = PerformanceMonitor(job_id)
    perf_monitor.start_job()

    # Initialize components
    analyzer = InputAnalyzer()
    param_optimizer = ParameterOptimizer()
    gpu_accelerator = GPUAccelerator()
    timeout_mgr = TimeoutManager()
    cache_mgr = CacheManager(settings.CACHE_DIR)
    quality_validator = QualityValidator()
    mesh_optimizer = MeshOptimizer()
    error_handler = ErrorHandler()
    pipeline_builder = MeshroomPipelineBuilder()
    preprocessor = ImagePreprocessor()

    params = None
    preprocessed_dir = None

    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return {"error": "Job not found"}

        # ----------------------------------------------------------------
        # 1. Input Validation (on original images)
        # ----------------------------------------------------------------
        job.status = "validating"
        job.current_stage = "validation"
        db.commit()

        perf_monitor.start_stage("validation")
        analysis = analyzer.analyze_input(input_path)
        perf_monitor.end_stage("validation")

        job.input_analysis = {
            "image_count": analysis.image_count,
            "avg_resolution": list(analysis.avg_resolution),
            "min_resolution": list(analysis.min_resolution),
            "avg_sharpness": analysis.avg_sharpness,
            "estimated_overlap": analysis.estimated_overlap,
            "validation_passed": analysis.validation_passed,
            "validation_errors": analysis.validation_errors,
            "processing_preset": analysis.processing_preset,
        }
        db.commit()

        if not analysis.validation_passed:
            job.status = "failed"
            job.failure_type = "validation_failed"
            job.error_details = {"errors": analysis.validation_errors}
            db.commit()
            return {"error": "Input validation failed", "details": analysis.validation_errors}

        # ----------------------------------------------------------------
        # 1b. Image Preprocessing (EXIF rotation, dedupe, exposure norm)
        # ----------------------------------------------------------------
        job.current_stage = "preprocessing"
        db.commit()

        perf_monitor.start_stage("preprocessing")
        preprocessed_dir = os.path.join(settings.RESULTS_DIR, f"job_{job_id}_preprocessed")
        pre_result = preprocessor.preprocess(input_path, output_dir=preprocessed_dir)
        perf_monitor.end_stage("preprocessing")

        # Use the preprocessed directory as input to Meshroom
        effective_input = pre_result.output_dir

        # Update analysis image count to reflect deduplicated set
        analysis.image_count = pre_result.processed_count

        if pre_result.warnings:
            existing = job.input_analysis or {}
            existing["preprocessing_warnings"] = pre_result.warnings
            job.input_analysis = existing

        job.input_analysis = {
            **job.input_analysis,
            "preprocessing": {
                "original_count": pre_result.original_count,
                "processed_count": pre_result.processed_count,
                "removed_duplicates": pre_result.removed_duplicates,
                "removed_blurry": pre_result.removed_blurry,
                "rotated": pre_result.rotated,
                "resized": pre_result.resized,
            },
        }
        db.commit()

        # ----------------------------------------------------------------
        # 2. Cache Check
        # ----------------------------------------------------------------
        image_hash = cache_mgr.compute_input_hash(effective_input)

        # ----------------------------------------------------------------
        # 3. Parameter Selection
        # ----------------------------------------------------------------
        retry_context = None
        if self.request.retries > 0 and job.failure_type:
            retry_context = {"failure_type": job.failure_type}

        params = param_optimizer.select_parameters(analysis, retry_context=retry_context)

        # Log quality settings for visibility
        quality_summary = pipeline_builder.get_quality_summary(params)
        job.meshroom_parameters = {
            "preset": params.preset,
            "feature_density": params.feature_density,
            "max_threads": params.max_threads,
            "downscale_factor": params.downscale_factor,
            "mesh_quality": params.mesh_quality,
            "texture_resolution": params.texture_resolution,
            "use_gpu": params.use_gpu,
            "quality_summary": quality_summary,
        }
        db.commit()

        params_hash = cache_mgr.compute_parameters_hash(vars(params))
        cached_stages = cache_mgr.check_cached_stages(image_hash, params_hash)

        # ----------------------------------------------------------------
        # 4. GPU Configuration
        # ----------------------------------------------------------------
        gpu_config = gpu_accelerator.configure_gpu()
        params.use_gpu = gpu_config.enabled
        job.used_gpu = gpu_config.enabled
        db.commit()

        # ----------------------------------------------------------------
        # 5. Timeout Configuration
        # ----------------------------------------------------------------
        timeout_config = timeout_mgr.calculate_timeout(analysis)

        # ----------------------------------------------------------------
        # 6. Run Meshroom with full quality parameters
        # ----------------------------------------------------------------
        job.status = "processing"
        db.commit()

        output_dir = os.path.join(settings.RESULTS_DIR, f"job_{job_id}")
        os.makedirs(output_dir, exist_ok=True)

        # Meshroom cache dir for stage resumption
        meshroom_cache_dir = os.path.join(settings.CACHE_DIR, "meshroom", image_hash[:16])

        if not os.path.exists(settings.MESHROOM_PATH):
            job.status = "failed"
            job.failure_type = "system_error"
            db.commit()
            return {"error": f"Meshroom executable not found at {settings.MESHROOM_PATH}"}

        # Build optimized command via pipeline builder — passes all quality
        # parameters including feature density, depth map quality, mesh settings
        meshroom_cmd = pipeline_builder.build_command(
            meshroom_path=settings.MESHROOM_PATH,
            input_path=effective_input,
            output_dir=output_dir,
            params=params,
            cache_dir=meshroom_cache_dir,
        )

        progress_tracker = ProgressTracker(job_id)
        perf_monitor.start_stage("meshroom_processing")

        # Use separate stderr pipe so we can capture error output accurately
        process = subprocess.Popen(
            meshroom_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=_build_meshroom_env(gpu_config),
        )

        # Collect stderr in a background thread while stdout drives progress
        stderr_lines: list = []

        def _collect_stderr_thread():
            for line in iter(process.stderr.readline, ""):
                stderr_lines.append(line.rstrip())

        stderr_thread = threading.Thread(target=_collect_stderr_thread, daemon=True)
        stderr_thread.start()

        progress_thread = threading.Thread(
            target=_monitor_progress,
            args=(process, progress_tracker, timeout_config, cache_mgr),
            daemon=True,
        )
        progress_thread.start()

        try:
            process.wait(timeout=timeout_config.total_timeout_seconds)
        except subprocess.TimeoutExpired:
            timeout_mgr.handle_timeout(job_id, job.current_stage or "unknown", cache_mgr)
            process.kill()
            job.status = "failed"
            job.failure_type = "timeout"
            db.commit()
            raise self.retry(countdown=settings.RETRY_DELAY_SECONDS)

        progress_thread.join(timeout=5)
        stderr_thread.join(timeout=5)
        perf_monitor.end_stage("meshroom_processing")

        # Capture actual error output for diagnosis
        error_output = "\n".join(stderr_lines)

        if process.returncode != 0:
            failure_type = error_handler.categorize_error(error_output)
            job.status = "failed"
            job.failure_type = failure_type
            job.error_details = error_handler.build_diagnostics(
                failure_type=failure_type,
                error_message="Meshroom processing failed",
                retry_count=self.request.retries,
                raw_error_output=error_output[-4000:],  # last 4KB of stderr
            ).__dict__
            db.commit()

            if error_handler.should_retry(failure_type, self.request.retries):
                raise self.retry(countdown=settings.RETRY_DELAY_SECONDS)
            return {"error": "Meshroom processing failed", "failure_type": failure_type}

        # ----------------------------------------------------------------
        # 7. Find Output Mesh
        # ----------------------------------------------------------------
        obj_path = _find_output_mesh(output_dir)
        if not obj_path:
            job.status = "failed"
            job.failure_type = "no_output"
            db.commit()
            raise self.retry(countdown=settings.RETRY_DELAY_SECONDS)

        job.model_path = obj_path
        job.status = "reconstructed"
        db.commit()

        # Cache completed stages
        cache_mgr.save_stage("reconstruction", output_dir, image_hash, params_hash)

        # ----------------------------------------------------------------
        # 8. Quality Validation
        # ----------------------------------------------------------------
        perf_monitor.start_stage("quality_validation")
        quality_metrics = quality_validator.validate_mesh(obj_path, output_dir)
        perf_monitor.end_stage("quality_validation")

        job.quality_score = quality_metrics.quality_score
        job.quality_metrics = {
            "quality_score": quality_metrics.quality_score,
            "is_watertight": quality_metrics.is_watertight,
            "watertightness_percent": quality_metrics.watertightness_percent,
            "vertex_count": quality_metrics.vertex_count,
            "face_count": quality_metrics.face_count,
            "surface_area": quality_metrics.surface_area,
            "hole_count": quality_metrics.hole_count,
            "non_manifold_edges": quality_metrics.non_manifold_edges,
            "degenerate_faces": quality_metrics.degenerate_faces,
            "reprojection_error_mean": quality_metrics.reprojection_error_mean,
            "reprojection_error_std": quality_metrics.reprojection_error_std,
            "camera_poses_reconstructed": quality_metrics.camera_poses_reconstructed,
            "camera_poses_total": quality_metrics.camera_poses_total,
            "point_cloud_density": quality_metrics.point_cloud_density,
            "texture_coverage_percent": quality_metrics.texture_coverage_percent,
        }
        db.commit()

        # ----------------------------------------------------------------
        # 9. Mesh Optimization
        # ----------------------------------------------------------------
        perf_monitor.start_stage("mesh_optimization")
        opt_result = mesh_optimizer.optimize_mesh(obj_path, quality_metrics)
        perf_monitor.end_stage("mesh_optimization")

        job.optimization_result = {
            "success": opt_result.success,
            "original_volume": opt_result.original_volume,
            "optimized_volume": opt_result.optimized_volume,
            "volume_change_percent": opt_result.volume_change_percent,
            "repairs_applied": opt_result.repairs_applied,
            "used_convex_hull": opt_result.used_convex_hull,
            "processing_time_seconds": opt_result.processing_time_seconds,
        }

        if opt_result.success:
            optimized_path = os.path.join(output_dir, "optimized_mesh.obj")
            if os.path.exists(optimized_path):
                job.model_path = optimized_path

        db.commit()

        # ----------------------------------------------------------------
        # 10. Performance Metrics
        # ----------------------------------------------------------------
        perf_metrics = perf_monitor.build_metrics(
            image_count=analysis.image_count,
            point_count=quality_metrics.vertex_count,
        )
        job.processing_time_seconds = perf_metrics.total_processing_time_seconds
        job.stage_timings = perf_metrics.stage_timings
        job.peak_cpu_percent = perf_metrics.peak_cpu_percent
        job.peak_ram_mb = perf_metrics.peak_ram_mb
        job.peak_gpu_memory_mb = perf_metrics.peak_gpu_memory_mb
        db.commit()

        # ----------------------------------------------------------------
        # 11. Trigger Volume Calculation
        # ----------------------------------------------------------------
        compute_volume.delay(job_id, job.model_path)

        return {
            "status": "success",
            "quality_score": quality_metrics.quality_score,
            "model_path": job.model_path,
        }

    except Exception as e:
        if db:
            try:
                job = db.query(Job).filter(Job.id == job_id).first()
                if job:
                    job.status = "failed"
                    job.failure_type = job.failure_type or "unexpected_error"
                    job.error_details = {
                        "error": str(e),
                        "traceback": traceback.format_exc(),
                    }
                    db.commit()
            except Exception:
                pass

        if self.request.retries < self.max_retries and params is not None:
            raise self.retry(countdown=settings.RETRY_DELAY_SECONDS)

        return {"error": str(e)}
    finally:
        db.close()
        # Clean up preprocessed image directory to free disk space
        if preprocessed_dir and os.path.isdir(preprocessed_dir):
            try:
                shutil.rmtree(preprocessed_dir, ignore_errors=True)
            except Exception:
                pass


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
