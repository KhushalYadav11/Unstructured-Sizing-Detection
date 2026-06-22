"""
Unit tests for Error Handler component.

Tests specific examples and edge cases for error categorization and retry logic.
"""

import pytest
from app.error_handler import (
    ErrorHandler,
    ErrorDiagnostics,
    ERROR_TIMEOUT,
    ERROR_GPU_FAILURE,
    ERROR_INSUFFICIENT_FEATURES,
    ERROR_VALIDATION,
    ERROR_INSUFFICIENT_IMAGES,
    ERROR_DISK_SPACE,
    ERROR_PROCESSING,
    ERROR_UNKNOWN,
)


@pytest.fixture
def handler():
    return ErrorHandler()


class TestErrorCategorization:
    """Tests for categorize_error method."""

    def test_timeout_error_categorized(self, handler):
        """Test timeout error output → categorized as timeout."""
        result = handler.categorize_error("Processing timed out after 3600 seconds")
        assert result == ERROR_TIMEOUT

    def test_gpu_failure_categorized(self, handler):
        """Test CUDA error → categorized as gpu_failure."""
        result = handler.categorize_error("CUDA error: out of memory on device 0")
        assert result == ERROR_GPU_FAILURE

    def test_insufficient_features_categorized(self, handler):
        """Test insufficient features → categorized correctly."""
        result = handler.categorize_error("Insufficient features found for matching")
        assert result == ERROR_INSUFFICIENT_FEATURES

    def test_insufficient_images_categorized(self, handler):
        """Test insufficient images → categorized correctly."""
        result = handler.categorize_error("Too few images provided for reconstruction")
        assert result == ERROR_INSUFFICIENT_IMAGES

    def test_disk_space_error_categorized(self, handler):
        """Test disk space error → categorized correctly."""
        result = handler.categorize_error("No space left on device (ENOSPC)")
        assert result == ERROR_DISK_SPACE

    def test_unknown_error_returns_unknown(self, handler):
        """Test unrecognized error → returns unknown."""
        result = handler.categorize_error("Some completely unrecognized error message xyz")
        assert result == ERROR_UNKNOWN

    def test_empty_error_returns_unknown(self, handler):
        """Test empty error output → returns unknown."""
        result = handler.categorize_error("")
        assert result == ERROR_UNKNOWN


class TestShouldRetry:
    """Tests for should_retry method."""

    def test_timeout_failure_allows_retry(self, handler):
        """Test timeout failure → retry allowed."""
        assert handler.should_retry(ERROR_TIMEOUT, 0) is True
        assert handler.should_retry(ERROR_TIMEOUT, 1) is True

    def test_insufficient_features_allows_retry(self, handler):
        """Test insufficient features → retry allowed."""
        assert handler.should_retry(ERROR_INSUFFICIENT_FEATURES, 0) is True

    def test_gpu_failure_allows_retry(self, handler):
        """Test GPU failure → retry with CPU."""
        assert handler.should_retry(ERROR_GPU_FAILURE, 0) is True

    def test_2_retries_exhausted_marks_permanently_failed(self, handler):
        """Test 2 retries exhausted → job marked permanently failed."""
        assert handler.should_retry(ERROR_TIMEOUT, 2) is False
        assert handler.should_retry(ERROR_GPU_FAILURE, 2) is False

    def test_validation_error_no_retry(self, handler):
        """Test validation error → no retry, immediate failure."""
        assert handler.should_retry(ERROR_VALIDATION, 0) is False

    def test_insufficient_images_no_retry(self, handler):
        """Test insufficient images → no retry."""
        assert handler.should_retry(ERROR_INSUFFICIENT_IMAGES, 0) is False

    def test_disk_space_no_retry(self, handler):
        """Test disk space error → no retry."""
        assert handler.should_retry(ERROR_DISK_SPACE, 0) is False


class TestParameterAdjustment:
    """Tests for adjust_parameters_for_retry method."""

    def test_timeout_reduces_quality(self, handler):
        """Test timeout failure → retry with reduced quality."""
        params = {
            "preset": "quality",
            "feature_density": "high",
            "max_threads": 16,
            "downscale_factor": 1,
            "mesh_quality": "ultra",
            "use_gpu": True,
        }
        adjusted = handler.adjust_parameters_for_retry(params, ERROR_TIMEOUT)
        assert adjusted["downscale_factor"] == 2
        assert adjusted["feature_density"] == "medium"
        assert adjusted["mesh_quality"] == "medium"
        assert adjusted["preset"] == "fast"

    def test_insufficient_features_increases_sensitivity(self, handler):
        """Test insufficient features → retry with increased sensitivity."""
        params = {
            "preset": "balanced",
            "feature_density": "medium",
            "max_threads": 8,
            "downscale_factor": 1,
            "mesh_quality": "high",
            "use_gpu": True,
        }
        adjusted = handler.adjust_parameters_for_retry(params, ERROR_INSUFFICIENT_FEATURES)
        assert adjusted["feature_density"] == "high"

    def test_gpu_failure_disables_gpu(self, handler):
        """Test GPU failure → retry with CPU."""
        params = {
            "preset": "balanced",
            "feature_density": "medium",
            "max_threads": 8,
            "downscale_factor": 1,
            "mesh_quality": "high",
            "use_gpu": True,
        }
        adjusted = handler.adjust_parameters_for_retry(params, ERROR_GPU_FAILURE)
        assert adjusted["use_gpu"] is False
        assert adjusted["max_threads"] <= 4


class TestBuildDiagnostics:
    """Tests for build_diagnostics method."""

    def test_diagnostics_contains_all_fields(self, handler):
        """Test diagnostics contains all required fields."""
        diag = handler.build_diagnostics(
            failure_type=ERROR_TIMEOUT,
            error_message="Job timed out",
            retry_count=1,
            input_characteristics={"image_count": 30},
            parameters_used={"preset": "quality"},
            system_resources={"ram_gb": 16},
            raw_error_output="Timeout after 3600s",
        )

        assert diag.failure_type == ERROR_TIMEOUT
        assert diag.error_message == "Job timed out"
        assert diag.retry_count == 1
        assert diag.is_retryable is True
        assert len(diag.remediation) > 0
        assert diag.input_characteristics == {"image_count": 30}
        assert diag.parameters_used == {"preset": "quality"}
        assert diag.system_resources == {"ram_gb": 16}
        assert diag.raw_error_output == "Timeout after 3600s"

    def test_permanent_error_not_retryable(self, handler):
        """Test permanent error diagnostics shows not retryable."""
        diag = handler.build_diagnostics(
            failure_type=ERROR_VALIDATION,
            error_message="Validation failed",
        )
        assert diag.is_retryable is False

    def test_remediation_message_is_actionable(self, handler):
        """Test remediation message is actionable (non-empty)."""
        for error_type in [ERROR_TIMEOUT, ERROR_GPU_FAILURE, ERROR_INSUFFICIENT_FEATURES,
                           ERROR_VALIDATION, ERROR_DISK_SPACE]:
            diag = handler.build_diagnostics(failure_type=error_type, error_message="error")
            assert len(diag.remediation) > 10, (
                f"Remediation for '{error_type}' should be actionable: {diag.remediation!r}"
            )
