"""
Property-Based Tests for Progress Tracker component.

Tests universal correctness properties across all valid inputs using Hypothesis.
"""

import time
import pytest
from hypothesis import given, strategies as st, settings

from app.progress_tracker import ProgressTracker, ProgressUpdate, STAGE_ORDER


# ---------------------------------------------------------------------------
# Property 4: Progress Reporting Frequency
# ---------------------------------------------------------------------------

class TestProperty4ProgressReporting:
    """
    Property 4: Progress Reporting Frequency
    Validates: Requirements 3.1, 3.2, 3.3, 3.4
    """

    @given(
        stage=st.sampled_from(STAGE_ORDER),
        percent=st.floats(min_value=0.0, max_value=100.0),
    )
    @settings(max_examples=100, deadline=None)
    def test_progress_update_contains_valid_stage_and_percent(self, stage, percent):
        """
        For any stage and percent, parsed progress SHALL contain valid stage and percent.
        Validates: Requirements 3.2, 3.3
        """
        tracker = ProgressTracker(job_id=1)

        # Build a line that contains both stage keyword and percentage
        stage_keywords = {
            "feature_extraction": "Feature extraction",
            "matching": "Feature matching",
            "reconstruction": "Structure from motion reconstruction",
            "texturing": "Texturing",
        }
        line = f"{stage_keywords[stage]}: {percent:.1f}%"

        update = tracker.parse_meshroom_output(line)

        assert update is not None, f"Expected update for line: {line!r}"
        assert update.stage in STAGE_ORDER, f"Invalid stage: {update.stage}"
        assert 0.0 <= update.percent_complete <= 100.0, (
            f"Percent out of range: {update.percent_complete}"
        )

    @given(
        stage=st.sampled_from(STAGE_ORDER),
        percent=st.floats(min_value=0.0, max_value=100.0),
    )
    @settings(max_examples=100, deadline=None)
    def test_remaining_time_is_non_negative(self, stage, percent):
        """
        For any stage and percent, estimated remaining time SHALL be non-negative.
        Validates: Requirement 3.4
        """
        tracker = ProgressTracker(job_id=1)
        remaining = tracker.estimate_remaining_time(stage, percent)
        assert remaining >= 0, (
            f"Expected non-negative remaining time for stage={stage}, percent={percent}"
        )

    @given(
        percent_early=st.floats(min_value=0.0, max_value=49.9),
        percent_late=st.floats(min_value=50.0, max_value=100.0),
    )
    @settings(max_examples=50, deadline=None)
    def test_remaining_time_decreases_as_percent_increases(self, percent_early, percent_late):
        """
        For any stage, remaining time SHALL decrease as percent_complete increases.
        Validates: Requirement 3.4
        """
        tracker = ProgressTracker(job_id=1)
        stage = "reconstruction"

        remaining_early = tracker.estimate_remaining_time(stage, percent_early)
        remaining_late = tracker.estimate_remaining_time(stage, percent_late)

        assert remaining_early >= remaining_late, (
            f"Expected remaining time to decrease: "
            f"at {percent_early:.1f}% got {remaining_early}s, "
            f"at {percent_late:.1f}% got {remaining_late}s"
        )

    @given(
        lines=st.lists(
            st.text(min_size=1, max_size=100, alphabet=st.characters(whitelist_categories=("L", "N", "P", "Zs"))),
            min_size=1,
            max_size=20,
        )
    )
    @settings(max_examples=50, deadline=None)
    def test_parse_never_raises_on_arbitrary_input(self, lines):
        """
        For any arbitrary text input, parse_meshroom_output SHALL never raise an exception.
        Validates: Requirement 3.1 (robustness)
        """
        tracker = ProgressTracker(job_id=1)
        for line in lines:
            try:
                result = tracker.parse_meshroom_output(line)
                # Result is either None or a valid ProgressUpdate
                if result is not None:
                    assert isinstance(result, ProgressUpdate)
                    assert result.stage in STAGE_ORDER
                    assert 0.0 <= result.percent_complete <= 100.0
            except Exception as exc:
                pytest.fail(
                    f"parse_meshroom_output raised {type(exc).__name__} for line {line!r}: {exc}"
                )

    def test_update_progress_respects_10_second_interval(self):
        """
        update_progress SHALL write to DB at most every 10 seconds.
        Validates: Requirement 3.1
        """
        tracker = ProgressTracker(job_id=1)
        update = ProgressUpdate(
            stage="feature_extraction",
            percent_complete=50.0,
            estimated_remaining_seconds=900,
        )

        # First call should write
        tracker._last_db_update = 0.0
        tracker.update_progress(update)
        first_write_time = tracker._last_db_update
        assert first_write_time > 0

        # Immediate second call should NOT write (interval not elapsed)
        tracker.update_progress(update)
        assert tracker._last_db_update == first_write_time, (
            "Expected no DB write within 10-second interval"
        )

        # After 10+ seconds, should write again
        tracker._last_db_update = time.time() - 11.0
        before = tracker._last_db_update
        tracker.update_progress(update)
        assert tracker._last_db_update >= before, (
            "Expected DB write after 10-second interval"
        )
        # The new write time should be close to now (not the old -11s value)
        assert tracker._last_db_update > time.time() - 1.0, (
            "Expected _last_db_update to be refreshed to current time"
        )
