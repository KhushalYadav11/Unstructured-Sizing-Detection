"""
Unit tests for GPU Accelerator component.

Tests specific examples and edge cases for GPU configuration and fallback logic.
"""

import os
import pytest
from unittest.mock import patch, MagicMock

from app.gpu_accelerator import GPUAccelerator, GPUConfig


def make_mock_pynvml(device_count=1, total_mb=8192, used_mb=1024, compute=(8, 6)):
    """Create a mock pynvml module."""
    mock = MagicMock()
    mock.nvmlDeviceGetCount.return_value = device_count

    handle = MagicMock()
    mem_info = MagicMock()
    mem_info.total = total_mb * 1024 * 1024
    mem_info.used = used_mb * 1024 * 1024
    mock.nvmlDeviceGetHandleByIndex.return_value = handle
    mock.nvmlDeviceGetMemoryInfo.return_value = mem_info
    mock.nvmlDeviceGetCudaComputeCapability.return_value = compute

    util = MagicMock()
    util.gpu = 50
    mock.nvmlDeviceGetUtilizationRates.return_value = util

    return mock


def make_accelerator(gpu_enabled=True, max_gpu_jobs=2, max_cpu_jobs=4):
    """Create a GPUAccelerator with mocked settings."""
    with patch("app.gpu_accelerator.settings") as mock_settings:
        mock_settings.GPU_ENABLED = gpu_enabled
        mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
        mock_settings.MAX_CONCURRENT_GPU_JOBS = max_gpu_jobs
        mock_settings.MAX_CONCURRENT_CPU_JOBS = max_cpu_jobs
        return GPUAccelerator()


class TestGPUConfiguration:
    """Tests for GPU configuration."""

    def test_gpu_available_and_enabled_configures_gpu(self):
        """Test GPU available + GPU_ENABLED=true → GPU configured."""
        mock_pynvml = make_mock_pynvml(device_count=1, total_mb=8192, used_mb=1024)

        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = True
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            with patch.dict("sys.modules", {"pynvml": mock_pynvml}):
                accelerator = GPUAccelerator()
                config = accelerator.configure_gpu()

        assert config.enabled is True
        assert config.fallback_to_cpu is False
        assert config.memory_limit_mb > 0
        assert config.device_id == 0

    def test_gpu_unavailable_falls_back_to_cpu(self):
        """Test GPU unavailable → CPU fallback."""
        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = True
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            accelerator = GPUAccelerator()

            # Simulate pynvml import failure
            with patch.dict("sys.modules", {"pynvml": None}):
                config = accelerator.configure_gpu()

        assert config.enabled is False
        assert config.fallback_to_cpu is True

    def test_gpu_disabled_by_setting_returns_cpu_config(self):
        """Test GPU_ENABLED=false → CPU fallback without checking hardware."""
        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = False
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            accelerator = GPUAccelerator()
            config = accelerator.configure_gpu()

        assert config.enabled is False
        assert config.fallback_to_cpu is True

    def test_gpu_memory_limit_is_90_percent_of_total(self):
        """Test GPU memory limit is set to 90% of total GPU memory."""
        total_mb = 8192
        mock_pynvml = make_mock_pynvml(device_count=1, total_mb=total_mb, used_mb=1024)

        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = True
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            with patch.dict("sys.modules", {"pynvml": mock_pynvml}):
                accelerator = GPUAccelerator()
                config = accelerator.configure_gpu()

        expected_limit = int(total_mb * 0.9)
        assert config.memory_limit_mb == expected_limit


class TestGPUMemoryFallback:
    """Tests for GPU memory threshold and fallback logic."""

    def test_gpu_memory_at_95_percent_triggers_fallback(self):
        """Test GPU memory at 95% → CPU fallback triggered."""
        accelerator = make_accelerator(gpu_enabled=True)
        usage = {
            "memory_used_mb": 7782,
            "memory_total_mb": 8192,
            "memory_percent": 0.95,
            "gpu_utilization_percent": 80,
            "available": True,
        }
        assert accelerator.should_fallback_to_cpu(usage) is True

    def test_gpu_memory_at_50_percent_no_fallback(self):
        """Test GPU memory at 50% → no fallback."""
        accelerator = make_accelerator(gpu_enabled=True)
        usage = {
            "memory_used_mb": 4096,
            "memory_total_mb": 8192,
            "memory_percent": 0.50,
            "gpu_utilization_percent": 40,
            "available": True,
        }
        assert accelerator.should_fallback_to_cpu(usage) is False

    def test_gpu_unavailable_in_usage_triggers_fallback(self):
        """Test GPU unavailable in usage dict → fallback."""
        accelerator = make_accelerator(gpu_enabled=True)
        usage = {
            "memory_used_mb": 0,
            "memory_total_mb": 0,
            "memory_percent": 0.0,
            "gpu_utilization_percent": 0,
            "available": False,
        }
        assert accelerator.should_fallback_to_cpu(usage) is True


class TestConcurrencyLimits:
    """Tests for concurrent job limits."""

    def test_gpu_available_limits_to_2_jobs(self):
        """Test 2 GPU jobs running → 3rd job should be queued (limit=2)."""
        mock_pynvml = make_mock_pynvml(device_count=1)

        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = True
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            with patch.dict("sys.modules", {"pynvml": mock_pynvml}):
                accelerator = GPUAccelerator()
                limit = accelerator.get_concurrent_job_limit()

        assert limit == 2

    def test_no_gpu_limits_to_4_cpu_jobs(self):
        """Test CPU-only mode → limit is 4 concurrent jobs."""
        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = False
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            accelerator = GPUAccelerator()
            limit = accelerator.get_concurrent_job_limit()

        assert limit == 4


class TestGPUMonitoring:
    """Tests for GPU usage monitoring."""

    def test_monitor_returns_usage_dict_when_gpu_available(self):
        """Test monitor_gpu_usage returns correct structure when GPU is available."""
        mock_pynvml = make_mock_pynvml(device_count=1, total_mb=8192, used_mb=2048)

        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = True
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            with patch.dict("sys.modules", {"pynvml": mock_pynvml}):
                accelerator = GPUAccelerator()
                usage = accelerator.monitor_gpu_usage()

        assert usage["available"] is True
        assert usage["memory_used_mb"] == 2048
        assert usage["memory_total_mb"] == 8192
        assert abs(usage["memory_percent"] - 0.25) < 0.01

    def test_monitor_returns_safe_defaults_when_gpu_fails(self):
        """Test monitor_gpu_usage returns safe defaults when GPU monitoring fails."""
        with patch("app.gpu_accelerator.settings") as mock_settings:
            mock_settings.GPU_ENABLED = True
            mock_settings.GPU_MEMORY_LIMIT_PERCENT = 0.9
            mock_settings.MAX_CONCURRENT_GPU_JOBS = 2
            mock_settings.MAX_CONCURRENT_CPU_JOBS = 4

            with patch.dict("sys.modules", {"pynvml": None}):
                accelerator = GPUAccelerator()
                usage = accelerator.monitor_gpu_usage()

        assert usage["available"] is False
        assert usage["memory_percent"] == 0.0
