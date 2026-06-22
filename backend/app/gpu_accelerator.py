"""
GPU Accelerator Component for Meshroom Performance Optimization

Manages GPU resource allocation, monitors usage, and handles fallback to CPU.
"""

import logging
import os
from dataclasses import dataclass, field
from typing import Dict, Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class GPUConfig:
    """GPU configuration for Meshroom processing."""
    enabled: bool
    device_id: int = 0
    memory_limit_mb: int = 0
    compute_capability: tuple = (0, 0)
    fallback_to_cpu: bool = False


class GPUAccelerator:
    """Manages GPU resource allocation and fallback to CPU."""

    # Memory threshold above which we fall back to CPU (90%)
    MEMORY_THRESHOLD_PERCENT: float = 0.90

    def __init__(self):
        self._gpu_enabled_setting = settings.GPU_ENABLED
        self._max_memory_percent = settings.GPU_MEMORY_LIMIT_PERCENT
        self._max_concurrent_jobs = settings.MAX_CONCURRENT_GPU_JOBS

    def check_gpu_availability(self) -> bool:
        """
        Checks if a compatible NVIDIA GPU is available using pynvml.

        Returns:
            True if at least one compatible GPU is available, False otherwise.
        """
        if not self._gpu_enabled_setting:
            return False

        try:
            import pynvml
            pynvml.nvmlInit()
            device_count = pynvml.nvmlDeviceGetCount()
            pynvml.nvmlShutdown()
            return device_count > 0
        except Exception as exc:
            logger.warning("GPU availability check failed: %s", exc)
            return False

    def configure_gpu(self, max_memory_percent: float = None) -> GPUConfig:
        """
        Configures GPU for Meshroom processing.

        Sets CUDA_VISIBLE_DEVICES and returns a GPUConfig.
        Falls back to CPU if GPU is unavailable or configuration fails.

        Args:
            max_memory_percent: Fraction of GPU memory to allow (default from settings)

        Returns:
            GPUConfig with enabled=True if GPU is available and configured,
            enabled=False with fallback_to_cpu=True otherwise.
        """
        if max_memory_percent is None:
            max_memory_percent = self._max_memory_percent

        if not self._gpu_enabled_setting:
            logger.info("GPU disabled by configuration (GPU_ENABLED=false)")
            return GPUConfig(enabled=False, fallback_to_cpu=True)

        try:
            import pynvml
            pynvml.nvmlInit()

            device_count = pynvml.nvmlDeviceGetCount()
            if device_count == 0:
                pynvml.nvmlShutdown()
                logger.info("No GPU devices found, falling back to CPU")
                return GPUConfig(enabled=False, fallback_to_cpu=True)

            # Use first available GPU
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            total_mb = mem_info.total // (1024 * 1024)
            memory_limit_mb = int(total_mb * max_memory_percent)

            # Get compute capability
            try:
                major, minor = pynvml.nvmlDeviceGetCudaComputeCapability(handle)
                compute_capability = (major, minor)
            except Exception:
                compute_capability = (0, 0)

            pynvml.nvmlShutdown()

            # Set CUDA device
            os.environ["CUDA_VISIBLE_DEVICES"] = "0"

            logger.info(
                "GPU configured: device_id=0, memory_limit=%dMB, compute=%s",
                memory_limit_mb,
                compute_capability,
            )

            return GPUConfig(
                enabled=True,
                device_id=0,
                memory_limit_mb=memory_limit_mb,
                compute_capability=compute_capability,
                fallback_to_cpu=False,
            )

        except Exception as exc:
            logger.warning("GPU configuration failed, falling back to CPU: %s", exc)
            return GPUConfig(enabled=False, fallback_to_cpu=True)

    def monitor_gpu_usage(self) -> Dict[str, Any]:
        """
        Returns current GPU memory and utilization metrics.

        Returns:
            Dict with keys: memory_used_mb, memory_total_mb, memory_percent,
            gpu_utilization_percent, available (bool)
        """
        try:
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            pynvml.nvmlShutdown()

            memory_used_mb = mem_info.used // (1024 * 1024)
            memory_total_mb = mem_info.total // (1024 * 1024)
            memory_percent = mem_info.used / mem_info.total if mem_info.total > 0 else 0.0

            return {
                "memory_used_mb": memory_used_mb,
                "memory_total_mb": memory_total_mb,
                "memory_percent": memory_percent,
                "gpu_utilization_percent": util.gpu,
                "available": True,
            }
        except Exception as exc:
            logger.warning("GPU monitoring failed: %s", exc)
            return {
                "memory_used_mb": 0,
                "memory_total_mb": 0,
                "memory_percent": 0.0,
                "gpu_utilization_percent": 0,
                "available": False,
            }

    def should_fallback_to_cpu(self, usage: Dict[str, Any]) -> bool:
        """
        Determines if GPU memory usage exceeds the 90% threshold.

        Args:
            usage: Dict returned by monitor_gpu_usage()

        Returns:
            True if fallback to CPU is recommended.
        """
        if not usage.get("available", False):
            return True
        memory_percent = usage.get("memory_percent", 0.0)
        return memory_percent > self.MEMORY_THRESHOLD_PERCENT

    def get_concurrent_job_limit(self) -> int:
        """
        Returns the maximum number of concurrent GPU-accelerated jobs.

        When GPU is available: returns MAX_CONCURRENT_GPU_JOBS (default 2).
        When GPU is unavailable: returns MAX_CONCURRENT_CPU_JOBS (default 4).

        Returns:
            Integer limit for concurrent jobs.
        """
        if self.check_gpu_availability():
            return self._max_concurrent_jobs
        return settings.MAX_CONCURRENT_CPU_JOBS
