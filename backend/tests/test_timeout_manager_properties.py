"""
Property-Based Tests for Timeout Manager component.

Tests universal correctness properties across all valid inputs using Hypothesis.
"""

import pytest
from hypothesis import given, strategies as st, settings

from app.timeout_manager import TimeoutManager, TimeoutConfig
from app.input_analyzer import InputAnalysis


def make_analysis(image_count: int, width: int = 1920, height: int = 1080) -> InputAnalysis:
    return InputAnalysis(
        image_count=image_count,
        avg_resolution=(width, height),
        min_resolution=(width, height),
        avg_sharpness=200.0,
        estimated_overlap=0.5,
        validation_passed=True,
        validation_errors=[],
        processing_preset="balanced",
    )


# ---------------------------------------------------------------------------
# Property 5: Dynamic Timeout Bound
# ---------------------------------------------------------------------------

class TestProperty5DynamicTimeoutBound:
    """
    Property 5: Dynamic Timeout Bound
    Validates: Requirements 4.1, 4.3, 4.4, 4.5
    """

    @given(
        image_count=st.integers(min_value=1, max_value=200),
        width=st.integers(min_value=640, max_value=7680),
        height=st.integers(min_value=480, max_value=4320),
    )
    @settings(max_examples=200, deadline=None)
    def test_timeout_always_within_bounds(self, image_count, width, height):
        """
        For any image count and resolution, calculated timeout SHALL be
        between 600 and 7200 seconds.
        Validates: Requirements 4.1, 4.4
        """
        manager = TimeoutManager()
        analysis = make_analysis(image_count, width, height)
        config = manager.calculate_timeout(analysis)

        assert config.total_timeout_seconds >= 600, (
            f"Timeout {config.total_timeout_seconds}s below minimum 600s "
            f"(image_count={image_count}, resolution={width}x{height})"
        )
        assert config.total_timeout_seconds <= 7200, (
            f"Timeout {config.total_timeout_seconds}s above maximum 7200s "
            f"(image_count={image_count}, resolution={width}x{height})"
        )

    @given(
        image_count=st.integers(min_value=1, max_value=200),
        width=st.integers(min_value=640, max_value=7680),
        height=st.integers(min_value=480, max_value=4320),
    )
    @settings(max_examples=100, deadline=None)
    def test_warning_threshold_is_80_percent_of_total(self, image_count, width, height):
        """
        For any input, warning threshold SHALL be 80% of total timeout.
        Validates: Requirement 4.2
        """
        manager = TimeoutManager()
        analysis = make_analysis(image_count, width, height)
        config = manager.calculate_timeout(analysis)

        expected_warning = int(config.total_timeout_seconds * 0.80)
        assert config.warning_threshold_seconds == expected_warning, (
            f"Expected warning at {expected_warning}s, got {config.warning_threshold_seconds}s"
        )

    @given(
        image_count=st.integers(min_value=1, max_value=200),
        width=st.integers(min_value=640, max_value=7680),
        height=st.integers(min_value=480, max_value=4320),
    )
    @settings(max_examples=100, deadline=None)
    def test_warning_threshold_less_than_total(self, image_count, width, height):
        """
        Warning threshold SHALL always be less than total timeout.
        """
        manager = TimeoutManager()
        analysis = make_analysis(image_count, width, height)
        config = manager.calculate_timeout(analysis)

        assert config.warning_threshold_seconds < config.total_timeout_seconds, (
            f"Warning threshold {config.warning_threshold_seconds}s should be "
            f"less than total {config.total_timeout_seconds}s"
        )

    @given(
        count_small=st.integers(min_value=1, max_value=10),
        count_large=st.integers(min_value=100, max_value=200),
    )
    @settings(max_examples=50, deadline=None)
    def test_more_images_gets_longer_or_equal_timeout(self, count_small, count_large):
        """
        More images SHALL result in a longer or equal timeout (before clamping).
        Validates: Requirement 4.1
        """
        manager = TimeoutManager()
        small_analysis = make_analysis(count_small, 1920, 1080)
        large_analysis = make_analysis(count_large, 1920, 1080)

        small_config = manager.calculate_timeout(small_analysis)
        large_config = manager.calculate_timeout(large_analysis)

        assert large_config.total_timeout_seconds >= small_config.total_timeout_seconds, (
            f"Expected larger timeout for {count_large} images vs {count_small} images"
        )

    @given(
        stage=st.sampled_from(["feature_extraction", "matching", "reconstruction", "texturing"]),
    )
    @settings(max_examples=20, deadline=None)
    def test_handle_timeout_records_incomplete_stage(self, stage):
        """
        When timeout occurs, the incomplete stage SHALL be recorded for diagnostics.
        Validates: Requirement 4.5
        """
        manager = TimeoutManager()
        manager.handle_timeout(job_id=1, current_stage=stage, cache_manager=None)
        assert manager.incomplete_stage == stage, (
            f"Expected incomplete_stage='{stage}', got '{manager.incomplete_stage}'"
        )
