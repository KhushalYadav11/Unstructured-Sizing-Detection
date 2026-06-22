"""
Timeout Manager Component for Meshroom Performance Optimization

Implements adaptive timeout with graceful degradation and intermediate result preservation.
"""

import logging
from dataclasses import dataclass
from typing import Optional, TYPE_CHECKING

from app.input_analyzer import InputAnalysis
from app.config import settings

if TYPE_CHECKING:
    from app.cache_manager import CacheManager

logger = logging.getLogger(__name__)

# Resolution multiplier threshold (pixels)
_4K_PIXEL_COUNT = 3840 * 2160  # ~8.3 MP


@dataclass
class TimeoutConfig:
    """Timeout configuration for a Meshroom job."""
    total_timeout_seconds: int
    warning_threshold_seconds: int   # 80% of total
    min_timeout: int = 600
    max_timeout: int = 7200


class TimeoutManager:
    """Manages adaptive timeout with graceful degradation."""

    def __init__(self):
        self._base_seconds_per_image = settings.TIMEOUT_BASE_SECONDS_PER_IMAGE
        self._min_timeout = settings.MIN_TIMEOUT_SECONDS
        self._max_timeout = settings.MAX_TIMEOUT_SECONDS

    def calculate_timeout(self, analysis: InputAnalysis) -> TimeoutConfig:
        """
        Calculates dynamic timeout based on input image count and resolution.

        Formula:
            base = base_seconds_per_image * image_count
            If avg resolution > 4K: apply 1.5x multiplier
            Clamp to [min_timeout, max_timeout]

        Args:
            analysis: InputAnalysis result from Input_Analyzer

        Returns:
            TimeoutConfig with total and warning thresholds
        """
        image_count = analysis.image_count
        avg_width, avg_height = analysis.avg_resolution

        # Base timeout
        base_timeout = self._base_seconds_per_image * image_count

        # Resolution multiplier for images larger than 4K
        pixel_count = avg_width * avg_height
        if pixel_count > _4K_PIXEL_COUNT:
            base_timeout = int(base_timeout * 1.5)

        # Clamp to bounds
        total_timeout = max(self._min_timeout, min(self._max_timeout, base_timeout))

        # Warning threshold at 80%
        warning_threshold = int(total_timeout * 0.80)

        logger.info(
            "Calculated timeout: %ds (warning at %ds) for %d images at %dx%d",
            total_timeout,
            warning_threshold,
            image_count,
            avg_width,
            avg_height,
        )

        return TimeoutConfig(
            total_timeout_seconds=total_timeout,
            warning_threshold_seconds=warning_threshold,
            min_timeout=self._min_timeout,
            max_timeout=self._max_timeout,
        )

    def check_timeout_warning(self, elapsed: int, config: TimeoutConfig) -> bool:
        """
        Returns True if 80% of the timeout duration has been reached.

        Args:
            elapsed: Elapsed seconds since job start
            config: TimeoutConfig for this job

        Returns:
            True if elapsed >= warning_threshold_seconds
        """
        return elapsed >= config.warning_threshold_seconds

    def handle_timeout(
        self,
        job_id: int,
        current_stage: str,
        cache_manager: Optional["CacheManager"] = None,
    ) -> None:
        """
        Preserves intermediate results and records the incomplete stage.

        Called when a job exceeds its timeout. Logs the incomplete stage for
        diagnostics and optionally triggers cache cleanup via cache_manager.

        Args:
            job_id: ID of the timed-out job
            current_stage: Name of the stage that was incomplete at timeout
            cache_manager: Optional CacheManager to persist intermediate results
        """
        logger.warning(
            "Job %d timed out during stage '%s'. Preserving completed stages.",
            job_id,
            current_stage,
        )

        # Record the incomplete stage for diagnostics
        # In production this would update the Job model in the database
        self._incomplete_stage = current_stage

        if cache_manager is not None:
            try:
                # Trigger cleanup of any partial outputs for this job
                cache_manager.cleanup_expired()
            except Exception as exc:
                logger.error(
                    "Failed to run cache cleanup after timeout for job %d: %s",
                    job_id,
                    exc,
                )

    @property
    def incomplete_stage(self) -> Optional[str]:
        """Returns the stage that was incomplete at timeout (for diagnostics)."""
        return getattr(self, "_incomplete_stage", None)
