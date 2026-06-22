"""
Property-Based Tests for Performance Monitor component.

Tests universal correctness properties across all valid inputs using Hypothesis.
"""

import time
import pytest
from hypothesis import given, strategies as st, settings

from app.performance_monitor import PerformanceMonitor, PerformanceMetrics
from app.progress_tracker import STAGE_ORDER


# ---------------------------------------------------------------------------
# Property 18: Performance Metrics Collection
# ---------------------------------------------------------------------------

class TestProperty18PerformanceMetrics:
    """
    Property 18: Performance Metrics Collection
    Validates: Requirements 15.1, 15.2, 15.3, 15.5
    """

    @given(
        image_count=st.integers(min_value=1, max_value=200),
        point_count=st.integers(min_value=0, max_value=1_000_000),
        total_time=st.floats(min_value=0.1, max_value=7200.0),
    )
    @settings(max_examples=100, deadline=None)
    def test_efficiency_metrics_always_non_negative(self, image_count, point_count, total_time):
        """
        For any processing scenario, efficiency metrics SHALL be non-negative.
        Validates: Requirement 15.3
        """
        monitor = PerformanceMonitor(job_id=1)
        efficiency = monitor.calculate_efficiency_metrics(image_count, point_count, total_time)

        assert efficiency["images_per_second"] >= 0, (
            f"images_per_second should be non-negative, got {efficiency['images_per_second']}"
        )
        assert efficiency["points_per_second"] >= 0, (
            f"points_per_second should be non-negative, got {efficiency['points_per_second']}"
        )

    @given(
        image_count=st.integers(min_value=1, max_value=200),
        point_count=st.integers(min_value=0, max_value=1_000_000),
        total_time=st.floats(min_value=0.1, max_value=7200.0),
    )
    @settings(max_examples=100, deadline=None)
    def test_more_images_gives_higher_images_per_second(self, image_count, point_count, total_time):
        """
        For the same processing time, more images SHALL give higher images/second.
        Validates: Requirement 15.3
        """
        monitor = PerformanceMonitor(job_id=1)

        eff_low = monitor.calculate_efficiency_metrics(image_count, point_count, total_time)
        eff_high = monitor.calculate_efficiency_metrics(image_count * 2, point_count, total_time)

        assert eff_high["images_per_second"] >= eff_low["images_per_second"], (
            f"More images should give higher images/sec: "
            f"{eff_high['images_per_second']} vs {eff_low['images_per_second']}"
        )

    @given(
        samples=st.lists(
            st.tuples(
                st.floats(min_value=0.0, max_value=100.0),
                st.floats(min_value=0.0, max_value=65536.0),
            ),
            min_size=1,
            max_size=20,
        ),
    )
    @settings(max_examples=50, deadline=None)
    def test_peak_resource_is_maximum_of_samples(self, samples):
        """
        Peak resource utilization SHALL be the maximum of all samples.
        Validates: Requirement 15.2
        """
        monitor = PerformanceMonitor(job_id=1)

        for cpu, ram in samples:
            monitor.record_resource_sample(cpu, ram)

        metrics = monitor.build_metrics()

        expected_cpu = max(s[0] for s in samples)
        expected_ram = max(s[1] for s in samples)

        assert abs(metrics.peak_cpu_percent - expected_cpu) < 0.001, (
            f"Peak CPU should be max of samples: {expected_cpu}, got {metrics.peak_cpu_percent}"
        )
        assert abs(metrics.peak_ram_mb - expected_ram) < 0.001, (
            f"Peak RAM should be max of samples: {expected_ram}, got {metrics.peak_ram_mb}"
        )

    @given(
        stages=st.lists(
            st.sampled_from(STAGE_ORDER),
            min_size=1,
            max_size=4,
            unique=True,
        )
    )
    @settings(max_examples=30, deadline=None)
    def test_stage_timings_recorded_for_all_stages(self, stages):
        """
        Processing time SHALL be recorded for each stage.
        Validates: Requirement 15.1
        """
        monitor = PerformanceMonitor(job_id=1)
        monitor.start_job()

        for stage in stages:
            monitor.start_stage(stage)
            monitor.end_stage(stage)

        metrics = monitor.build_metrics()

        for stage in stages:
            assert stage in metrics.stage_timings, (
                f"Expected stage '{stage}' in stage_timings"
            )
            assert metrics.stage_timings[stage] >= 0, (
                f"Stage timing for '{stage}' should be non-negative"
            )

    def test_zero_time_gives_zero_efficiency(self):
        """
        Zero processing time SHALL give zero efficiency metrics.
        """
        monitor = PerformanceMonitor(job_id=1)
        efficiency = monitor.calculate_efficiency_metrics(10, 1000, 0.0)
        assert efficiency["images_per_second"] == 0.0
        assert efficiency["points_per_second"] == 0.0
