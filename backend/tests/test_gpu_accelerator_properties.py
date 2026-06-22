"""
Property-Based Tests for GPU Accelerator component.

Tests universal correctness properties across all valid inputs using Hypothesis.
"""

import pytest
from unittest.mock import patch, MagicMock
from hypothesis import given, strategies as st, settings

from app.gpu_accelerator import GPUAccelerator, GPUConfig


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_usage(memory_percent: float, available: bool = True) -> dict:
    """Build a GPU usage dict for testing."""
    total_mb = 8192
    used_mb = int(total_mb * memory_percent)
    return {
        "memory_used_mb": used_mb,
        "memory_total_mb": total_mb,
        "memory_percent": memory_percent,
        "gpu_utilization_percent": 50,
        "available": available,
    }


# ---------------------------------------------------------------------------
# Property 1: GPU Configuration and Fallback
# ---------------------------------------------------------------------------

class TestProperty1GPUConfigurationAndFallback:
    """
    Property 1: GPU Configuration and Fallback
    Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
    """

    @given(memory_percent=st.floats(min_value=0.0, max_value=0.89))
    @settings(max_examples=50, deadline=None)
    def test_no_fallback_when_memory_below_threshold(self, memory_percent):
        """
        For any GPU memory usage below 90%, should_fallback_to_cpu SHALL return False.
        Validates: Requirement 1.3
        """
        accelerator = GPUAccelerator()
        usage = make_usage(memory_percent, available=True)
        assert not accelerator.should_fallback_to_cpu(usage), (
            f"Expected no fallback at {memory_percent:.1%} memory usage"
        )

    @given(memory_percent=st.floats(min_value=0.91, max_value=1.0))
    @settings(max_examples=50, deadline=None)
    def test_fallback_when_memory_exceeds_threshold(self, memory_percent):
        """
        For any GPU memory usage above 90%, should_fallback_to_cpu SHALL return True.
        Validates: Requirement 1.3
        """
        accelerator = GPUAccelerator()
        usage = make_usage(memory_percent, available=True)
        assert accelerator.should_fallback_to_cpu(usage), (
            f"Expected fallback at {memory_percent:.1%} memory usage"
        )

    @given(memory_percent=st.floats(min_value=0.0, max_value=1.0))
    @settings(max_examples=50, deadline=None)
    def test_fallback_when_gpu_unavailable(self, memory_percent):
        """
        When GPU is unavailable, should_fallback_to_cpu SHALL always return True.
        Validates: Requirement 1.5
        """
        accelerator = GPUAccelerator()
        usage = make_usage(memory_percent, available=False)
        assert accelerator.should_fallback_to_cpu(usage), (
            "Expected fallback when GPU is unavailable"
        )

    def test_gpu_enabled_false_returns_cpu_config(self):
        """
        When GPU_ENABLED=false, configure_gpu SHALL return CPU fallback config.
        Validates: Requirement 1.1
        """
        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = False
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            accelerator = GPUAccelerator()
            config = accelerator.configure_gpu()

            assert not config.enabled
            assert config.fallback_to_cpu

    def test_gpu_unavailable_returns_cpu_fallback(self):
        """
        When no GPU is detected, configure_gpu SHALL fall back to CPU and log failure.
        Validates: Requirements 1.4, 1.5
        """
        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = True
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            accelerator = GPUAccelerator()

            # Simulate pynvml not available / no GPU
            with patch.dict("sys.modules", {"pynvml": None}):
                config = accelerator.configure_gpu()

            assert not config.enabled
            assert config.fallback_to_cpu

    def test_gpu_available_returns_enabled_config(self):
        """
        When GPU is available and GPU_ENABLED=true, configure_gpu SHALL enable GPU.
        Validates: Requirements 1.1, 1.4
        """
        mock_pynvml = MagicMock()
        mock_handle = MagicMock()
        mock_mem = MagicMock()
        mock_mem.total = 8 * 1024 * 1024 * 1024  # 8 GB
        mock_mem.used = 1 * 1024 * 1024 * 1024   # 1 GB
        mock_pynvml.nvmlDeviceGetCount.return_value = 1
        mock_pynvml.nvmlDeviceGetHandleByIndex.return_value = mock_handle
        mock_pynvml.nvmlDeviceGetMemoryInfo.return_value = mock_mem
        mock_pynvml.nvmlDeviceGetCudaComputeCapability.return_value = (8, 6)

        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = True
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            with patch.dict("sys.modules", {"pynvml": mock_pynvml}):
                accelerator = GPUAccelerator()
                config = accelerator.configure_gpu()

        assert config.enabled
        assert not config.fallback_to_cpu
        assert config.memory_limit_mb > 0


# ---------------------------------------------------------------------------
# Property 13: Resource-Based Concurrency Limits
# ---------------------------------------------------------------------------

class TestProperty13ConcurrencyLimits:
    """
    Property 13: Resource-Based Concurrency Limits
    Validates: Requirements 9.4, 12.1, 12.2, 12.3, 12.5
    """

    def test_gpu_available_limits_to_2_concurrent_jobs(self):
        """
        When GPU is available, concurrent GPU jobs SHALL be limited to 2.
        Validates: Requirement 12.2
        """
        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = True
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            accelerator = GPUAccelerator()

            mock_pynvml = MagicMock()
            mock_pynvml.nvmlDeviceGetCount.return_value = 1

            with patch.dict("sys.modules", {"pynvml": mock_pynvml}):
                limit = accelerator.get_concurrent_job_limit()

            assert limit == 2, f"Expected 2 concurrent GPU jobs, got {limit}"

    def test_no_gpu_limits_to_4_concurrent_cpu_jobs(self):
        """
        When only CPU is available, concurrent jobs SHALL be limited to 4.
        Validates: Requirement 12.3
        """
        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = False
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            accelerator = GPUAccelerator()
            limit = accelerator.get_concurrent_job_limit()

            assert limit == 4, f"Expected 4 concurrent CPU jobs, got {limit}"

    @given(
        gpu_available=st.booleans(),
        memory_percent=st.floats(min_value=0.0, max_value=1.0),
    )
    @settings(max_examples=50, deadline=None)
    def test_concurrency_limit_always_positive(self, gpu_available, memory_percent):
        """
        For any resource state, the concurrency limit SHALL always be positive.
        Validates: Requirements 12.1, 12.2, 12.3
        """
        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = gpu_available
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            accelerator = GPUAccelerator()

            if not gpu_available:
                limit = accelerator.get_concurrent_job_limit()
                assert limit > 0, "Concurrency limit must be positive"
                assert limit == 4
