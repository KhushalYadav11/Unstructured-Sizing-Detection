"""
Integration tests for the complete Meshroom optimization workflow.

Tests the interaction between all components without requiring a real Meshroom binary.
"""

import os
import tempfile
import pytest
from unittest.mock import patch, MagicMock

from app.input_analyzer import InputAnalyzer, InputAnalysis
from app.parameter_optimizer import ParameterOptimizer
from app.gpu_accelerator import GPUAccelerator
from app.timeout_manager import TimeoutManager
from app.progress_tracker import ProgressTracker
from app.cache_manager import CacheManager
from app.quality_validator import QualityValidator
from app.mesh_optimizer import MeshOptimizer
from app.error_handler import ErrorHandler
from app.performance_monitor import PerformanceMonitor


def make_valid_analysis(image_count: int = 30) -> InputAnalysis:
    """Create a valid InputAnalysis for testing."""
    return InputAnalysis(
        image_count=image_count,
        avg_resolution=(1920, 1080),
        min_resolution=(1920, 1080),
        avg_sharpness=200.0,
        estimated_overlap=0.5,
        validation_passed=True,
        validation_errors=[],
        processing_preset="balanced",
    )


def make_invalid_analysis() -> InputAnalysis:
    """Create an invalid InputAnalysis (too few images)."""
    return InputAnalysis(
        image_count=5,
        avg_resolution=(1920, 1080),
        min_resolution=(1920, 1080),
        avg_sharpness=200.0,
        estimated_overlap=0.5,
        validation_passed=False,
        validation_errors=["Insufficient image count: 5 < 8 (minimum required)"],
        processing_preset="fast",
    )


class TestWorkflowComponentIntegration:
    """Integration tests for component interactions."""

    def test_valid_job_completes_with_quality_score(self):
        """Test valid job submission → completes with quality score."""
        analysis = make_valid_analysis(30)

        # Parameter selection
        optimizer = ParameterOptimizer()
        params = optimizer.select_parameters(analysis)
        assert params.preset == "balanced"

        # Timeout calculation
        timeout_mgr = TimeoutManager()
        timeout_config = timeout_mgr.calculate_timeout(analysis)
        assert timeout_config.total_timeout_seconds == 1800  # 30 * 60

        # GPU configuration (no GPU in test env)
        gpu_accelerator = GPUAccelerator()
        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = False
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4
            gpu_config = gpu_accelerator.configure_gpu()
        assert not gpu_config.enabled

        # Quality validation with a real mesh
        import trimesh
        with tempfile.TemporaryDirectory() as tmpdir:
            mesh = trimesh.creation.icosphere(subdivisions=2)
            mesh_path = os.path.join(tmpdir, "mesh.obj")
            mesh.export(mesh_path)

            validator = QualityValidator()
            metrics = validator.validate_mesh(mesh_path)
            assert 0 <= metrics.quality_score <= 100

            # Mesh optimization
            mesh_optimizer = MeshOptimizer()
            opt_result = mesh_optimizer.optimize_mesh(mesh_path)
            assert opt_result.success

    def test_job_with_5_images_fails_validation_immediately(self):
        """Test job with 5 images → validation fails immediately."""
        analyzer = InputAnalyzer()

        with tempfile.TemporaryDirectory() as tmpdir:
            import cv2
            import numpy as np
            for i in range(5):
                img = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
                cv2.imwrite(os.path.join(tmpdir, f"img_{i}.jpg"), img)

            analysis = analyzer.analyze_input(tmpdir)
            assert not analysis.validation_passed
            assert any("Insufficient image count" in e for e in analysis.validation_errors)

    def test_gpu_available_metrics_recorded(self):
        """Test job with GPU available → GPU used, metrics recorded."""
        monitor = PerformanceMonitor(job_id=1)
        monitor.start_job()
        monitor.record_resource_sample(cpu_percent=60.0, ram_mb=8192.0, gpu_memory_mb=4096.0)
        metrics = monitor.build_metrics(image_count=30, point_count=50000)

        assert metrics.used_gpu is True
        assert metrics.peak_gpu_memory_mb == 4096.0

    def test_timeout_failure_retries_with_reduced_quality(self):
        """Test job that times out → retries with reduced quality."""
        error_handler = ErrorHandler()
        optimizer = ParameterOptimizer()

        # Original quality params
        analysis = make_valid_analysis(75)
        original_params = optimizer.select_parameters(analysis)
        assert original_params.preset == "quality"

        # After timeout, adjust for retry
        adjusted = optimizer.adjust_for_retry(original_params, "timeout")
        assert adjusted.preset == "fast"
        assert adjusted.downscale_factor == 2

    def test_job_with_cached_stages_resumes_faster(self):
        """Test job with cached stages → resumes from cache."""
        with tempfile.TemporaryDirectory() as tmpdir:
            cache = CacheManager(cache_dir=tmpdir, max_size_gb=100, expiration_days=7)

            # Simulate cached feature_extraction and matching stages
            for stage in ["feature_extraction", "matching"]:
                output_path = os.path.join(tmpdir, f"{stage}.txt")
                with open(output_path, "w") as f:
                    f.write(f"{stage} output")
                cache.save_stage(stage, output_path, "hash1", "params1")

            cached = cache.check_cached_stages("hash1", "params1")
            resume_stage = cache.get_resume_stage(cached)

            assert resume_stage == "reconstruction"
            assert len(cached) == 2

    def test_3_concurrent_gpu_jobs_limit(self):
        """Test 2 GPU jobs running → 3rd job should be queued (limit=2)."""
        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = True
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            mock_pynvml = MagicMock()
            mock_pynvml.nvmlDeviceGetCount.return_value = 1

            with patch.dict("sys.modules", {"pynvml": mock_pynvml}):
                accelerator = GPUAccelerator()
                limit = accelerator.get_concurrent_job_limit()

        assert limit == 2, f"Expected max 2 concurrent GPU jobs, got {limit}"


class TestErrorHandlingIntegration:
    """Integration tests for error handling and retry logic."""

    def test_validation_error_no_retry(self):
        """Test validation error → no retry, immediate failure."""
        error_handler = ErrorHandler()
        assert not error_handler.should_retry("validation_failed", 0)

    def test_gpu_failure_retry_with_cpu(self):
        """Test GPU failure → retry with CPU."""
        error_handler = ErrorHandler()
        assert error_handler.should_retry("gpu_failure", 0)

        params = {
            "preset": "balanced",
            "feature_density": "medium",
            "max_threads": 8,
            "downscale_factor": 1,
            "mesh_quality": "high",
            "use_gpu": True,
        }
        adjusted = error_handler.adjust_parameters_for_retry(params, "gpu_failure")
        assert adjusted["use_gpu"] is False

    def test_2_retries_exhausted_permanently_failed(self):
        """Test 2 retries exhausted → job marked permanently failed."""
        error_handler = ErrorHandler()
        assert not error_handler.should_retry("timeout", 2)
        assert not error_handler.should_retry("gpu_failure", 2)
        assert not error_handler.should_retry("insufficient_features", 2)


class TestPerformanceMonitoringIntegration:
    """Integration tests for performance monitoring."""

    def test_all_stages_timed_and_stored(self):
        """Test processing time recorded for each stage."""
        monitor = PerformanceMonitor(job_id=1)
        monitor.start_job()

        stages = ["validation", "meshroom_processing", "quality_validation", "mesh_optimization"]
        for stage in stages:
            monitor.start_stage(stage)
            monitor.end_stage(stage)

        metrics = monitor.build_metrics(image_count=30, point_count=50000)

        for stage in stages:
            assert stage in metrics.stage_timings
            assert metrics.stage_timings[stage] >= 0

    def test_efficiency_metrics_calculated(self):
        """Test efficiency metrics calculated (images/sec, points/sec)."""
        monitor = PerformanceMonitor(job_id=1)
        monitor.start_job()

        metrics = monitor.build_metrics(image_count=30, point_count=50000)

        assert metrics.images_per_second >= 0
        assert metrics.points_per_second >= 0
