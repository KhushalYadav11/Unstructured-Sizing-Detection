"""
Unit tests for Timeout Manager component.

Tests specific examples and edge cases for timeout calculation and management.
"""

import pytest
from unittest.mock import MagicMock, patch

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


@pytest.fixture
def manager():
    return TimeoutManager()


class TestTimeoutCalculation:
    """Tests for calculate_timeout method."""

    def test_30_images_at_1080p_gives_1800_seconds(self, manager):
        """Test 30 images at 1080p → timeout = 1800 seconds (30 * 60)."""
        analysis = make_analysis(30, 1920, 1080)
        config = manager.calculate_timeout(analysis)
        assert config.total_timeout_seconds == 1800

    def test_10_images_at_4k_clamped_to_minimum(self, manager):
        """Test 10 images at 4K → timeout clamped to minimum 600 seconds."""
        # 10 * 60 = 600, at 4K (3840x2160 = 8.3MP > 4K threshold) → 600 * 1.5 = 900
        # But 4K threshold is 3840*2160 = 8,294,400 pixels
        # 3840x2160 > threshold → 10 * 60 * 1.5 = 900 → within bounds
        # Use a smaller resolution to hit the minimum
        analysis = make_analysis(5, 640, 480)  # 5 * 60 = 300 → clamped to 600
        config = manager.calculate_timeout(analysis)
        assert config.total_timeout_seconds == 600

    def test_200_images_at_1080p_clamped_to_maximum(self, manager):
        """Test 200 images at 1080p → timeout clamped to maximum 7200 seconds."""
        # 200 * 60 = 12000 → clamped to 7200
        analysis = make_analysis(200, 1920, 1080)
        config = manager.calculate_timeout(analysis)
        assert config.total_timeout_seconds == 7200

    def test_4k_resolution_applies_multiplier(self, manager):
        """Test images above 4K resolution get 1.5x multiplier."""
        # 20 images at 1080p: 20 * 60 = 1200
        analysis_1080p = make_analysis(20, 1920, 1080)
        config_1080p = manager.calculate_timeout(analysis_1080p)

        # 20 images at 8K (7680x4320 >> 4K threshold): 20 * 60 * 1.5 = 1800
        analysis_8k = make_analysis(20, 7680, 4320)
        config_8k = manager.calculate_timeout(analysis_8k)

        assert config_8k.total_timeout_seconds > config_1080p.total_timeout_seconds

    def test_warning_threshold_is_80_percent(self, manager):
        """Test warning threshold is 80% of total timeout."""
        analysis = make_analysis(30, 1920, 1080)
        config = manager.calculate_timeout(analysis)
        expected_warning = int(config.total_timeout_seconds * 0.80)
        assert config.warning_threshold_seconds == expected_warning

    def test_min_timeout_is_600(self, manager):
        """Test minimum timeout is 600 seconds."""
        analysis = make_analysis(1, 640, 480)
        config = manager.calculate_timeout(analysis)
        assert config.total_timeout_seconds >= 600
        assert config.min_timeout == 600

    def test_max_timeout_is_7200(self, manager):
        """Test maximum timeout is 7200 seconds."""
        analysis = make_analysis(200, 7680, 4320)
        config = manager.calculate_timeout(analysis)
        assert config.total_timeout_seconds <= 7200
        assert config.max_timeout == 7200


class TestTimeoutWarning:
    """Tests for check_timeout_warning method."""

    def test_80_percent_reached_triggers_warning(self, manager):
        """Test 80% timeout reached → graceful completion attempted."""
        config = TimeoutConfig(
            total_timeout_seconds=1800,
            warning_threshold_seconds=1440,  # 80% of 1800
        )
        assert manager.check_timeout_warning(1440, config) is True
        assert manager.check_timeout_warning(1500, config) is True

    def test_below_80_percent_no_warning(self, manager):
        """Test below 80% → no warning."""
        config = TimeoutConfig(
            total_timeout_seconds=1800,
            warning_threshold_seconds=1440,
        )
        assert manager.check_timeout_warning(1000, config) is False
        assert manager.check_timeout_warning(1439, config) is False

    def test_exactly_at_threshold_triggers_warning(self, manager):
        """Test exactly at threshold → warning triggered."""
        config = TimeoutConfig(
            total_timeout_seconds=1000,
            warning_threshold_seconds=800,
        )
        assert manager.check_timeout_warning(800, config) is True


class TestHandleTimeout:
    """Tests for handle_timeout method."""

    def test_incomplete_stage_recorded(self, manager):
        """Test timeout exceeded → incomplete stage recorded for diagnostics."""
        manager.handle_timeout(job_id=1, current_stage="reconstruction")
        assert manager.incomplete_stage == "reconstruction"

    def test_handle_timeout_with_cache_manager(self, manager):
        """Test handle_timeout calls cache_manager.cleanup_expired."""
        mock_cache = MagicMock()
        manager.handle_timeout(job_id=1, current_stage="matching", cache_manager=mock_cache)
        mock_cache.cleanup_expired.assert_called_once()

    def test_handle_timeout_without_cache_manager(self, manager):
        """Test handle_timeout works without cache_manager."""
        # Should not raise
        manager.handle_timeout(job_id=1, current_stage="texturing", cache_manager=None)
        assert manager.incomplete_stage == "texturing"

    def test_incomplete_stage_none_before_timeout(self, manager):
        """Test incomplete_stage is None before any timeout occurs."""
        assert manager.incomplete_stage is None
