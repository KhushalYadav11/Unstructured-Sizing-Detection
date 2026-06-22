"""
Progress Tracker Component for Meshroom Performance Optimization

Monitors Meshroom processing stages and reports progress to the database.
"""

import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# Known Meshroom stages in processing order
STAGE_ORDER = [
    "feature_extraction",
    "matching",
    "reconstruction",
    "texturing",
]

# Approximate time fractions for each stage (used for remaining time estimation)
STAGE_TIME_FRACTIONS: Dict[str, float] = {
    "feature_extraction": 0.20,
    "matching": 0.25,
    "reconstruction": 0.40,
    "texturing": 0.15,
}

# Regex patterns to detect stage and progress from Meshroom stdout
_STAGE_PATTERNS = [
    (re.compile(r"feature\s*extract", re.IGNORECASE), "feature_extraction"),
    (re.compile(r"feature\s*match|image\s*match", re.IGNORECASE), "matching"),
    (re.compile(r"reconstruct|sfm|structure.from.motion", re.IGNORECASE), "reconstruction"),
    (re.compile(r"textur", re.IGNORECASE), "texturing"),
]

_PROGRESS_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%")


@dataclass
class ProgressUpdate:
    """Snapshot of current processing progress."""
    stage: str                          # e.g. "feature_extraction"
    percent_complete: float             # 0.0 – 100.0
    estimated_remaining_seconds: int    # seconds remaining
    last_update_time: datetime = field(default_factory=datetime.utcnow)


class ProgressTracker:
    """Monitors Meshroom processing stages and reports progress."""

    # Minimum interval between database writes (seconds)
    UPDATE_INTERVAL_SECONDS: float = 10.0
    # Stall detection threshold (seconds)
    STALL_THRESHOLD_SECONDS: float = 60.0

    def __init__(self, job_id: int):
        self.job_id = job_id
        self.current_stage: str = "feature_extraction"
        self.current_percent: float = 0.0
        self.stage_start_times: Dict[str, datetime] = {}
        self.stage_durations: Dict[str, float] = {}
        self._last_db_update: float = 0.0
        self._last_output_time: float = time.time()
        self.last_output_line: str = ""

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def parse_meshroom_output(self, output_line: str) -> Optional[ProgressUpdate]:
        """
        Parses a single line of Meshroom stdout for stage and progress information.

        Args:
            output_line: A single line from Meshroom stdout/stderr

        Returns:
            ProgressUpdate if progress information was found, None otherwise.
        """
        if not output_line:
            return None

        self.last_output_line = output_line
        self._last_output_time = time.time()

        # Detect stage change
        detected_stage = self._detect_stage(output_line)
        if detected_stage and detected_stage != self.current_stage:
            # Record duration of previous stage
            if self.current_stage in self.stage_start_times:
                elapsed = (
                    datetime.utcnow() - self.stage_start_times[self.current_stage]
                ).total_seconds()
                self.stage_durations[self.current_stage] = elapsed

            self.current_stage = detected_stage
            self.stage_start_times[detected_stage] = datetime.utcnow()
            logger.info("Stage changed to: %s", detected_stage)

        # Detect progress percentage
        percent = self._detect_percent(output_line)
        if percent is not None:
            self.current_percent = percent

        # Only return an update if we have something meaningful
        if detected_stage or percent is not None:
            remaining = self.estimate_remaining_time(self.current_stage, self.current_percent)
            return ProgressUpdate(
                stage=self.current_stage,
                percent_complete=self.current_percent,
                estimated_remaining_seconds=remaining,
            )

        return None

    def update_progress(self, update: ProgressUpdate) -> None:
        """
        Writes progress to the database at most every UPDATE_INTERVAL_SECONDS.

        In production this would write to the Job model via a DB session.
        Here we log the update and track the last write time.

        Args:
            update: ProgressUpdate to persist
        """
        now = time.time()
        if now - self._last_db_update >= self.UPDATE_INTERVAL_SECONDS:
            self._last_db_update = now
            logger.info(
                "Job %d progress: stage=%s, percent=%.1f%%, remaining=%ds",
                self.job_id,
                update.stage,
                update.percent_complete,
                update.estimated_remaining_seconds,
            )

    def estimate_remaining_time(self, current_stage: str, percent: float) -> int:
        """
        Estimates remaining processing time in seconds.

        Uses stage completion rates derived from observed stage durations,
        falling back to time-fraction estimates when no history is available.

        Args:
            current_stage: Name of the current stage
            percent: Completion percentage within the current stage (0-100)

        Returns:
            Estimated remaining seconds (non-negative integer)
        """
        if current_stage not in STAGE_ORDER:
            return 0

        stage_idx = STAGE_ORDER.index(current_stage)
        remaining_seconds = 0.0

        # Estimate time left in current stage
        current_fraction = STAGE_TIME_FRACTIONS.get(current_stage, 0.25)
        if current_stage in self.stage_durations:
            # Use observed duration to estimate total stage time
            observed = self.stage_durations[current_stage]
            if percent > 0:
                total_stage_time = observed / (percent / 100.0)
                remaining_in_stage = total_stage_time * (1.0 - percent / 100.0)
            else:
                remaining_in_stage = observed
        else:
            # Estimate based on fraction of total time
            # Assume total job time ≈ 1800s (30 min) as baseline
            baseline_total = 1800.0
            remaining_in_stage = baseline_total * current_fraction * (1.0 - percent / 100.0)

        remaining_seconds += remaining_in_stage

        # Add estimated time for all subsequent stages
        for future_stage in STAGE_ORDER[stage_idx + 1:]:
            fraction = STAGE_TIME_FRACTIONS.get(future_stage, 0.25)
            if future_stage in self.stage_durations:
                remaining_seconds += self.stage_durations[future_stage]
            else:
                remaining_seconds += 1800.0 * fraction

        return max(0, int(remaining_seconds))

    def detect_stall(self) -> bool:
        """
        Detects if processing has stalled (no output for STALL_THRESHOLD_SECONDS).

        Returns:
            True if no progress has been detected for 60+ seconds.
        """
        elapsed = time.time() - self._last_output_time
        if elapsed > self.STALL_THRESHOLD_SECONDS:
            logger.warning(
                "Job %d: Processing stalled — no output for %.0fs",
                self.job_id,
                elapsed,
            )
            return True
        return False

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _detect_stage(self, line: str) -> Optional[str]:
        """Detect stage name from a log line."""
        for pattern, stage_name in _STAGE_PATTERNS:
            if pattern.search(line):
                return stage_name
        return None

    def _detect_percent(self, line: str) -> Optional[float]:
        """Extract progress percentage from a log line."""
        match = _PROGRESS_PATTERN.search(line)
        if match:
            value = float(match.group(1))
            return min(100.0, max(0.0, value))
        return None
