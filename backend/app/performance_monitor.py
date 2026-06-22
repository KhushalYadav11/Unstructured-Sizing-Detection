"""
Performance Monitor Component for Meshroom Performance Optimization

Tracks processing time, resource utilization, and efficiency metrics.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class PerformanceMetrics:
    """Performance metrics for a Meshroom processing job."""
    total_processing_time_seconds: float = 0.0
    stage_timings: Dict[str, float] = field(default_factory=dict)  # stage_name -> seconds
    peak_cpu_percent: float = 0.0
    peak_ram_mb: float = 0.0
    peak_gpu_memory_mb: float = 0.0
    images_per_second: float = 0.0
    points_per_second: float = 0.0
    used_gpu: bool = False


class PerformanceMonitor:
    """
    Tracks processing performance metrics during Meshroom execution.

    Records total time, per-stage timing, peak resource utilization,
    and efficiency metrics.
    """

    def __init__(self, job_id: int):
        self.job_id = job_id
        self._job_start_time: Optional[float] = None
        self._stage_start_times: Dict[str, float] = {}
        self._stage_timings: Dict[str, float] = {}
        self._peak_cpu_percent: float = 0.0
        self._peak_ram_mb: float = 0.0
        self._peak_gpu_memory_mb: float = 0.0
        self._used_gpu: bool = False

    # ------------------------------------------------------------------
    # Timing
    # ------------------------------------------------------------------

    def start_job(self) -> None:
        """Record job start time."""
        self._job_start_time = time.time()
        logger.debug("Job %d: performance monitoring started", self.job_id)

    def start_stage(self, stage_name: str) -> None:
        """Record start time for a processing stage."""
        self._stage_start_times[stage_name] = time.time()

    def end_stage(self, stage_name: str) -> float:
        """
        Record end time for a processing stage and return duration.

        Args:
            stage_name: Name of the completed stage

        Returns:
            Duration of the stage in seconds
        """
        if stage_name not in self._stage_start_times:
            logger.warning("end_stage called for '%s' without start_stage", stage_name)
            return 0.0

        duration = time.time() - self._stage_start_times[stage_name]
        self._stage_timings[stage_name] = duration
        logger.debug("Job %d: stage '%s' completed in %.2fs", self.job_id, stage_name, duration)
        return duration

    def get_total_time(self) -> float:
        """
        Returns total elapsed time since job start.

        Returns:
            Elapsed seconds, or 0 if job hasn't started
        """
        if self._job_start_time is None:
            return 0.0
        return time.time() - self._job_start_time

    # ------------------------------------------------------------------
    # Resource tracking
    # ------------------------------------------------------------------

    def record_resource_sample(
        self,
        cpu_percent: float,
        ram_mb: float,
        gpu_memory_mb: float = 0.0,
    ) -> None:
        """
        Records a resource utilization sample and updates peak values.

        Args:
            cpu_percent: Current CPU utilization (0-100)
            ram_mb: Current RAM usage in MB
            gpu_memory_mb: Current GPU memory usage in MB
        """
        self._peak_cpu_percent = max(self._peak_cpu_percent, cpu_percent)
        self._peak_ram_mb = max(self._peak_ram_mb, ram_mb)
        self._peak_gpu_memory_mb = max(self._peak_gpu_memory_mb, gpu_memory_mb)

        if gpu_memory_mb > 0:
            self._used_gpu = True

    def sample_system_resources(self) -> Dict[str, float]:
        """
        Samples current system resource utilization using psutil.

        Returns:
            Dict with cpu_percent, ram_mb, gpu_memory_mb
        """
        result = {"cpu_percent": 0.0, "ram_mb": 0.0, "gpu_memory_mb": 0.0}

        try:
            import psutil
            result["cpu_percent"] = psutil.cpu_percent(interval=0.1)
            mem = psutil.virtual_memory()
            result["ram_mb"] = mem.used / (1024 * 1024)
        except ImportError:
            logger.debug("psutil not available for resource sampling")
        except Exception as exc:
            logger.debug("Resource sampling failed: %s", exc)

        try:
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            result["gpu_memory_mb"] = mem_info.used / (1024 * 1024)
            pynvml.nvmlShutdown()
        except Exception:
            pass

        return result

    # ------------------------------------------------------------------
    # Efficiency metrics
    # ------------------------------------------------------------------

    def calculate_efficiency_metrics(
        self,
        image_count: int,
        point_count: int,
        total_time_seconds: float,
    ) -> Dict[str, float]:
        """
        Calculates processing efficiency metrics.

        Args:
            image_count: Number of input images processed
            point_count: Number of 3D points in the reconstruction
            total_time_seconds: Total processing time in seconds

        Returns:
            Dict with images_per_second and points_per_second
        """
        if total_time_seconds <= 0:
            return {"images_per_second": 0.0, "points_per_second": 0.0}

        return {
            "images_per_second": image_count / total_time_seconds,
            "points_per_second": point_count / total_time_seconds,
        }

    # ------------------------------------------------------------------
    # Build final metrics
    # ------------------------------------------------------------------

    def build_metrics(
        self,
        image_count: int = 0,
        point_count: int = 0,
    ) -> PerformanceMetrics:
        """
        Builds the final PerformanceMetrics object.

        Args:
            image_count: Number of input images
            point_count: Number of reconstructed 3D points

        Returns:
            PerformanceMetrics with all collected data
        """
        total_time = self.get_total_time()
        efficiency = self.calculate_efficiency_metrics(image_count, point_count, total_time)

        return PerformanceMetrics(
            total_processing_time_seconds=total_time,
            stage_timings=dict(self._stage_timings),
            peak_cpu_percent=self._peak_cpu_percent,
            peak_ram_mb=self._peak_ram_mb,
            peak_gpu_memory_mb=self._peak_gpu_memory_mb,
            images_per_second=efficiency["images_per_second"],
            points_per_second=efficiency["points_per_second"],
            used_gpu=self._used_gpu,
        )
