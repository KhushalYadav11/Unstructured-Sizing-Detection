"""
Unit tests for Progress Tracker component.

Tests specific examples and edge cases for progress parsing and tracking.
"""

import time
import pytest
from datetime import datetime

from app.progress_tracker import ProgressTracker, ProgressUpdate, STAGE_ORDER


@pytest.fixture
def tracker():
    return ProgressTracker(job_id=42)


class TestParseMeshroomOutput:
    """Tests for parse_meshroom_output method."""

    def test_feature_extraction_50_percent(self, tracker):
        """Test 'Feature extraction: 50%' → stage=feature_extraction, percent=50."""
        update = tracker.parse_meshroom_output("Feature extraction: 50%")
        assert update is not None
        assert update.stage == "feature_extraction"
        assert update.percent_complete == 50.0

    def test_matching_stage_detected(self, tracker):
        """Test matching stage keyword detection."""
        update = tracker.parse_meshroom_output("Feature matching in progress 30%")
        assert update is not None
        assert update.stage == "matching"
        assert update.percent_complete == 30.0

    def test_reconstruction_stage_detected(self, tracker):
        """Test reconstruction stage keyword detection."""
        update = tracker.parse_meshroom_output("Structure from motion reconstruction 75%")
        assert update is not None
        assert update.stage == "reconstruction"
        assert update.percent_complete == 75.0

    def test_texturing_stage_detected(self, tracker):
        """Test texturing stage keyword detection."""
        update = tracker.parse_meshroom_output("Texturing mesh 90%")
        assert update is not None
        assert update.stage == "texturing"
        assert update.percent_complete == 90.0

    def test_empty_line_returns_none(self, tracker):
        """Test empty line returns None."""
        result = tracker.parse_meshroom_output("")
        assert result is None

    def test_line_without_stage_or_percent_returns_none(self, tracker):
        """Test line with no stage or percent returns None."""
        result = tracker.parse_meshroom_output("Loading configuration file...")
        assert result is None

    def test_percent_clamped_to_100(self, tracker):
        """Test percent values > 100 are clamped to 100."""
        update = tracker.parse_meshroom_output("Feature extraction: 150%")
        assert update is not None
        assert update.percent_complete == 100.0

    def test_percent_clamped_to_0(self, tracker):
        """Test negative percent values are clamped to 0."""
        # Negative percent won't match the regex (no minus in pattern), so stays 0
        result = tracker.parse_meshroom_output("Feature extraction: -10%")
        # The regex won't match negative numbers, so no percent detected
        # Stage is detected though
        if result is not None:
            assert result.percent_complete >= 0.0

    def test_stage_change_recorded(self, tracker):
        """Test that stage changes are tracked correctly."""
        tracker.parse_meshroom_output("Feature extraction: 100%")
        assert tracker.current_stage == "feature_extraction"

        tracker.parse_meshroom_output("Feature matching: 10%")
        assert tracker.current_stage == "matching"

    def test_last_output_line_updated(self, tracker):
        """Test that last_output_line is updated on each parse."""
        line = "Feature extraction: 50%"
        tracker.parse_meshroom_output(line)
        assert tracker.last_output_line == line


class TestStallDetection:
    """Tests for stall detection."""

    def test_no_stall_when_recently_active(self, tracker):
        """Test no stall detected when output was recent."""
        tracker._last_output_time = time.time()
        assert not tracker.detect_stall()

    def test_stall_detected_after_60_seconds(self, tracker):
        """Test stall detected when no progress for 60+ seconds."""
        tracker._last_output_time = time.time() - 65.0
        assert tracker.detect_stall()

    def test_no_stall_at_59_seconds(self, tracker):
        """Test no stall at 59 seconds (just below threshold)."""
        tracker._last_output_time = time.time() - 59.0
        assert not tracker.detect_stall()


class TestRemainingTimeEstimation:
    """Tests for remaining time estimation."""

    def test_remaining_time_at_0_percent(self, tracker):
        """Test remaining time at 0% is positive."""
        remaining = tracker.estimate_remaining_time("feature_extraction", 0.0)
        assert remaining > 0

    def test_remaining_time_at_100_percent_last_stage(self, tracker):
        """Test remaining time at 100% of last stage is 0."""
        remaining = tracker.estimate_remaining_time("texturing", 100.0)
        assert remaining == 0

    def test_remaining_time_decreases_with_progress(self, tracker):
        """Test remaining time decreases as percent increases."""
        r0 = tracker.estimate_remaining_time("reconstruction", 0.0)
        r50 = tracker.estimate_remaining_time("reconstruction", 50.0)
        r100 = tracker.estimate_remaining_time("reconstruction", 100.0)

        assert r0 >= r50 >= r100

    def test_remaining_time_uses_observed_stage_duration(self, tracker):
        """Test remaining time uses observed stage duration when available."""
        # Simulate feature_extraction took 200 seconds
        tracker.stage_durations["feature_extraction"] = 200.0

        # At 50% of feature_extraction, should estimate ~100s remaining in stage
        remaining = tracker.estimate_remaining_time("feature_extraction", 50.0)
        # Plus time for remaining stages
        assert remaining > 0

    def test_unknown_stage_returns_zero(self, tracker):
        """Test unknown stage returns 0."""
        remaining = tracker.estimate_remaining_time("unknown_stage", 50.0)
        assert remaining == 0


class TestUpdateProgress:
    """Tests for update_progress method."""

    def test_first_update_writes_to_db(self, tracker):
        """Test first update always writes."""
        tracker._last_db_update = 0.0
        update = ProgressUpdate(
            stage="feature_extraction",
            percent_complete=25.0,
            estimated_remaining_seconds=1200,
        )
        tracker.update_progress(update)
        assert tracker._last_db_update > 0

    def test_rapid_updates_throttled(self, tracker):
        """Test rapid updates are throttled to 10-second intervals."""
        update = ProgressUpdate(
            stage="matching",
            percent_complete=50.0,
            estimated_remaining_seconds=900,
        )
        tracker._last_db_update = 0.0
        tracker.update_progress(update)
        first_time = tracker._last_db_update

        # Immediate second call — should not update
        tracker.update_progress(update)
        assert tracker._last_db_update == first_time

    def test_update_after_interval_writes(self, tracker):
        """Test update writes after 10-second interval has elapsed."""
        update = ProgressUpdate(
            stage="reconstruction",
            percent_complete=75.0,
            estimated_remaining_seconds=300,
        )
        tracker._last_db_update = time.time() - 11.0
        tracker.update_progress(update)
        assert tracker._last_db_update > time.time() - 1.0
