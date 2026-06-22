"""
Unit tests for Performance Monitor component.

Tests specific examples and edge cases for performance tracking.
"""

import time
import pytest

from app.performance_monitor import PerformanceMonitor, PerformanceMetrics


@pytest.fixture
def monitor():
    return PerformanceMonitor(job_id=1)


class TestStageTiming:
    """Tests for stage timing methods."""

    def test_stage_timing_recorded(self, monitor):
        """Test processing time recorded for each stage."""
        monitor.start_job()
        monitor.start_stage("feature_extraction")
        time.sleep(0.01)  # Small delay
        duration = monitor.end_stage("feature_extraction")

        assert duration >= 0.01
        assert "feature_extraction" in monitor._stage_timings

    def test_multiple_stages_recorded(self, monitor):
        """Test multiple stage timings are all recorded."""
        monitor.start_job()
        stages = ["feature_extraction", "matching", "reconstruction"]

        for stage in stages:
            monitor.start_stage(stage)
            monitor.end_stage(stage)

        metrics = monitor.build_metrics()
        for stage in stages:
            assert stage in metrics.stage_timings

    def test_end_stage_without_start_returns_zero(self, monitor):
        """Test end_stage without start_stage returns 0."""
        duration = monitor.end_stage("nonexistent_stage")
        assert duration == 0.0

    def test_total_time_increases_over_time(self, monitor):
        """Test total time increases as job runs."""
        monitor.start_job()
        t1 = monitor.get_total_time()
        time.sleep(0.01)
        t2 = monitor.get_total_time()
        assert t2 > t1

    def test_total_time_zero_before_start(self, monitor):
        """Test total time is 0 before job starts."""
        assert monitor.get_total_time() == 0.0


class TestResourceTracking:
    """Tests for resource tracking methods."""

    def test_peak_cpu_tracked(self, monitor):
        """Test peak CPU utilization is tracked."""
        monitor.record_resource_sample(cpu_percent=50.0, ram_mb=4096.0)
        monitor.record_resource_sample(cpu_percent=80.0, ram_mb=4096.0)
        monitor.record_resource_sample(cpu_percent=60.0, ram_mb=4096.0)

        metrics = monitor.build_metrics()
        assert metrics.peak_cpu_percent == 80.0

    def test_peak_ram_tracked(self, monitor):
        """Test peak RAM usage is tracked."""
        monitor.record_resource_sample(cpu_percent=50.0, ram_mb=4096.0)
        monitor.record_resource_sample(cpu_percent=50.0, ram_mb=8192.0)
        monitor.record_resource_sample(cpu_percent=50.0, ram_mb=6144.0)

        metrics = monitor.build_metrics()
        assert metrics.peak_ram_mb == 8192.0

    def test_peak_gpu_memory_tracked(self, monitor):
        """Test peak GPU memory usage is tracked."""
        monitor.record_resource_sample(cpu_percent=50.0, ram_mb=4096.0, gpu_memory_mb=2048.0)
        monitor.record_resource_sample(cpu_percent=50.0, ram_mb=4096.0, gpu_memory_mb=6144.0)

        metrics = monitor.build_metrics()
        assert metrics.peak_gpu_memory_mb == 6144.0

    def test_gpu_used_flag_set_when_gpu_memory_recorded(self, monitor):
        """Test used_gpu flag is set when GPU memory is recorded."""
        monitor.record_resource_sample(cpu_percent=50.0, ram_mb=4096.0, gpu_memory_mb=2048.0)
        metrics = monitor.build_metrics()
        assert metrics.used_gpu is True

    def test_gpu_used_flag_false_without_gpu_memory(self, monitor):
        """Test used_gpu flag is False when no GPU memory recorded."""
        monitor.record_resource_sample(cpu_percent=50.0, ram_mb=4096.0, gpu_memory_mb=0.0)
        metrics = monitor.build_metrics()
        assert metrics.used_gpu is False


class TestEfficiencyMetrics:
    """Tests for efficiency metric calculation."""

    def test_images_per_second_calculated(self, monitor):
        """Test images/sec efficiency metric calculated."""
        efficiency = monitor.calculate_efficiency_metrics(
            image_count=30, point_count=100000, total_time_seconds=60.0
        )
        assert abs(efficiency["images_per_second"] - 0.5) < 0.001

    def test_points_per_second_calculated(self, monitor):
        """Test points/sec efficiency metric calculated."""
        efficiency = monitor.calculate_efficiency_metrics(
            image_count=30, point_count=100000, total_time_seconds=100.0
        )
        assert abs(efficiency["points_per_second"] - 1000.0) < 0.001

    def test_zero_time_returns_zero_efficiency(self, monitor):
        """Test zero processing time returns zero efficiency."""
        efficiency = monitor.calculate_efficiency_metrics(10, 1000, 0.0)
        assert efficiency["images_per_second"] == 0.0
        assert efficiency["points_per_second"] == 0.0


class TestBuildMetrics:
    """Tests for build_metrics method."""

    def test_metrics_stored_in_job_record(self, monitor):
        """Test all metrics are stored in the PerformanceMetrics object."""
        monitor.start_job()
        monitor.start_stage("feature_extraction")
        monitor.end_stage("feature_extraction")
        monitor.record_resource_sample(cpu_percent=75.0, ram_mb=8192.0, gpu_memory_mb=4096.0)

        metrics = monitor.build_metrics(image_count=30, point_count=50000)

        assert isinstance(metrics, PerformanceMetrics)
        assert metrics.total_processing_time_seconds >= 0
        assert "feature_extraction" in metrics.stage_timings
        assert metrics.peak_cpu_percent == 75.0
        assert metrics.peak_ram_mb == 8192.0
        assert metrics.peak_gpu_memory_mb == 4096.0
        assert metrics.images_per_second >= 0
        assert metrics.points_per_second >= 0
        assert metrics.used_gpu is True
