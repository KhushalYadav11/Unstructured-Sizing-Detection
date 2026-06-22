"""
Property-Based Tests for Error Handler component.

Tests universal correctness properties across all valid inputs using Hypothesis.
"""

import pytest
from hypothesis import given, strategies as st, settings

from app.error_handler import (
    ErrorHandler,
    RETRYABLE_ERRORS,
    PERMANENT_ERRORS,
    REMEDIATION_MESSAGES,
    ERROR_UNKNOWN,
)


# ---------------------------------------------------------------------------
# Property 15: Error Categorization and Remediation
# ---------------------------------------------------------------------------

class TestProperty15ErrorCategorization:
    """
    Property 15: Error Categorization and Remediation
    Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
    """

    @given(
        error_output=st.text(min_size=0, max_size=500),
    )
    @settings(max_examples=100, deadline=None)
    def test_categorize_never_raises(self, error_output):
        """
        For any error output, categorize_error SHALL never raise an exception.
        Validates: Requirement 10.1
        """
        handler = ErrorHandler()
        try:
            result = handler.categorize_error(error_output)
            assert isinstance(result, str)
            assert len(result) > 0
        except Exception as exc:
            pytest.fail(f"categorize_error raised {type(exc).__name__}: {exc}")

    @given(
        failure_type=st.sampled_from(list(RETRYABLE_ERRORS)),
        retry_count=st.integers(min_value=0, max_value=1),
    )
    @settings(max_examples=50, deadline=None)
    def test_retryable_errors_allow_retry_within_limit(self, failure_type, retry_count):
        """
        Retryable errors SHALL allow retry when retry count is within limit.
        Validates: Requirement 10.5
        """
        handler = ErrorHandler()
        result = handler.should_retry(failure_type, retry_count)
        assert result is True, (
            f"Expected retry=True for retryable error '{failure_type}' "
            f"at retry_count={retry_count}"
        )

    @given(
        failure_type=st.sampled_from(list(PERMANENT_ERRORS)),
        retry_count=st.integers(min_value=0, max_value=5),
    )
    @settings(max_examples=50, deadline=None)
    def test_permanent_errors_never_retry(self, failure_type, retry_count):
        """
        Permanent errors SHALL never be retried regardless of retry count.
        Validates: Requirement 10.5
        """
        handler = ErrorHandler()
        result = handler.should_retry(failure_type, retry_count)
        assert result is False, (
            f"Expected retry=False for permanent error '{failure_type}'"
        )

    @given(
        failure_type=st.sampled_from(list(RETRYABLE_ERRORS)),
        retry_count=st.integers(min_value=2, max_value=10),
    )
    @settings(max_examples=50, deadline=None)
    def test_retryable_errors_stop_after_max_retries(self, failure_type, retry_count):
        """
        Retryable errors SHALL stop retrying after max_retries (2) attempts.
        Validates: Requirement 10.5
        """
        handler = ErrorHandler()
        result = handler.should_retry(failure_type, retry_count)
        assert result is False, (
            f"Expected retry=False for '{failure_type}' at retry_count={retry_count} >= 2"
        )

    @given(
        failure_type=st.sampled_from(list(REMEDIATION_MESSAGES.keys())),
    )
    @settings(max_examples=50, deadline=None)
    def test_all_error_types_have_remediation_message(self, failure_type):
        """
        All error types SHALL have actionable remediation messages.
        Validates: Requirement 10.3
        """
        handler = ErrorHandler()
        message = handler.get_remediation_message(failure_type)
        assert isinstance(message, str)
        assert len(message) > 10, (
            f"Remediation message for '{failure_type}' is too short: {message!r}"
        )


# ---------------------------------------------------------------------------
# Property 17: Automatic Retry with Parameter Adjustment
# ---------------------------------------------------------------------------

class TestProperty17AutomaticRetry:
    """
    Property 17: Automatic Retry with Parameter Adjustment
    Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
    """

    @given(
        failure_type=st.sampled_from(list(RETRYABLE_ERRORS)),
        retry_count=st.integers(min_value=0, max_value=1),
    )
    @settings(max_examples=50, deadline=None)
    def test_retry_adjusts_parameters(self, failure_type, retry_count):
        """
        For any retryable failure, parameters SHALL be adjusted for retry.
        Validates: Requirements 14.2, 14.3, 14.4
        """
        handler = ErrorHandler()
        original_params = {
            "preset": "quality",
            "feature_density": "high",
            "max_threads": 16,
            "downscale_factor": 1,
            "mesh_quality": "ultra",
            "use_gpu": True,
        }

        adjusted = handler.adjust_parameters_for_retry(original_params, failure_type)

        # Parameters should be a dict
        assert isinstance(adjusted, dict)
        # Should have same keys
        assert set(adjusted.keys()) == set(original_params.keys())

    @given(
        retry_count=st.integers(min_value=0, max_value=1),
    )
    @settings(max_examples=20, deadline=None)
    def test_timeout_retry_reduces_quality(self, retry_count):
        """
        Timeout failure SHALL reduce quality settings for faster retry.
        Validates: Requirement 14.3
        """
        handler = ErrorHandler()
        params = {
            "preset": "quality",
            "feature_density": "high",
            "max_threads": 16,
            "downscale_factor": 1,
            "mesh_quality": "ultra",
            "use_gpu": True,
        }

        adjusted = handler.adjust_parameters_for_retry(params, "timeout")

        assert adjusted["downscale_factor"] >= params["downscale_factor"], (
            "Timeout retry should increase downscale (reduce quality)"
        )

    @given(
        retry_count=st.integers(min_value=0, max_value=1),
    )
    @settings(max_examples=20, deadline=None)
    def test_insufficient_features_retry_increases_sensitivity(self, retry_count):
        """
        Insufficient features failure SHALL increase feature sensitivity for retry.
        Validates: Requirement 14.4
        """
        handler = ErrorHandler()
        density_order = ["low", "medium", "high", "ultra"]
        params = {
            "preset": "balanced",
            "feature_density": "medium",
            "max_threads": 8,
            "downscale_factor": 1,
            "mesh_quality": "high",
            "use_gpu": True,
        }

        adjusted = handler.adjust_parameters_for_retry(params, "insufficient_features")

        original_idx = density_order.index(params["feature_density"])
        adjusted_idx = density_order.index(adjusted["feature_density"])

        assert adjusted_idx > original_idx, (
            f"Expected higher density after retry, got '{adjusted['feature_density']}' "
            f"from '{params['feature_density']}'"
        )

    @given(
        retry_count=st.integers(min_value=0, max_value=1),
    )
    @settings(max_examples=20, deadline=None)
    def test_gpu_failure_retry_disables_gpu(self, retry_count):
        """
        GPU failure SHALL disable GPU for retry.
        Validates: Requirement 14.2
        """
        handler = ErrorHandler()
        params = {
            "preset": "balanced",
            "feature_density": "medium",
            "max_threads": 8,
            "downscale_factor": 1,
            "mesh_quality": "high",
            "use_gpu": True,
        }

        adjusted = handler.adjust_parameters_for_retry(params, "gpu_failure")

        assert adjusted["use_gpu"] is False, "GPU should be disabled after GPU failure"
        assert adjusted["max_threads"] <= 4, "Thread count should be reduced after GPU failure"
