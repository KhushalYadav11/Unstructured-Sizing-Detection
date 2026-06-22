"""
Property-Based Tests for Priority Queue component.

Tests universal correctness properties across all valid inputs using Hypothesis.
"""

import pytest
from hypothesis import given, strategies as st, settings

from app.priority_queue import (
    get_job_priority,
    sort_jobs_by_priority,
    QUEUE_HIGH_PRIORITY,
    QUEUE_MEDIUM_PRIORITY,
    QUEUE_LOW_PRIORITY,
    PRIORITY_HIGH,
    PRIORITY_MEDIUM,
    PRIORITY_LOW,
)


# ---------------------------------------------------------------------------
# Property 14: Priority Queue Ordering
# ---------------------------------------------------------------------------

class TestProperty14PriorityQueueOrdering:
    """
    Property 14: Priority Queue Ordering
    Validates: Requirement 12.4
    """

    @given(
        image_counts=st.lists(
            st.integers(min_value=1, max_value=200),
            min_size=2,
            max_size=20,
        )
    )
    @settings(max_examples=100, deadline=None)
    def test_jobs_ordered_by_image_count_ascending(self, image_counts):
        """
        For any set of queued jobs, jobs SHALL be ordered by image count ascending.
        Jobs with fewer images SHALL process before larger jobs.
        Validates: Requirement 12.4
        """
        jobs = [{"job_id": i, "image_count": count} for i, count in enumerate(image_counts)]
        sorted_jobs = sort_jobs_by_priority(jobs)

        # Verify ascending order
        for i in range(len(sorted_jobs) - 1):
            assert sorted_jobs[i]["image_count"] <= sorted_jobs[i + 1]["image_count"], (
                f"Jobs not in ascending order: "
                f"{sorted_jobs[i]['image_count']} > {sorted_jobs[i+1]['image_count']}"
            )

    @given(
        image_count=st.integers(min_value=1, max_value=19),
    )
    @settings(max_examples=50, deadline=None)
    def test_small_jobs_get_high_priority(self, image_count):
        """
        Jobs with < 20 images SHALL get high priority queue.
        Validates: Requirement 12.4
        """
        priority = get_job_priority(image_count)
        assert priority.queue == QUEUE_HIGH_PRIORITY, (
            f"Expected high priority queue for {image_count} images, got '{priority.queue}'"
        )
        assert priority.priority == PRIORITY_HIGH

    @given(
        image_count=st.integers(min_value=20, max_value=50),
    )
    @settings(max_examples=50, deadline=None)
    def test_medium_jobs_get_medium_priority(self, image_count):
        """
        Jobs with 20-50 images SHALL get medium priority queue.
        Validates: Requirement 12.4
        """
        priority = get_job_priority(image_count)
        assert priority.queue == QUEUE_MEDIUM_PRIORITY, (
            f"Expected medium priority queue for {image_count} images, got '{priority.queue}'"
        )
        assert priority.priority == PRIORITY_MEDIUM

    @given(
        image_count=st.integers(min_value=51, max_value=200),
    )
    @settings(max_examples=50, deadline=None)
    def test_large_jobs_get_low_priority(self, image_count):
        """
        Jobs with > 50 images SHALL get low priority queue.
        Validates: Requirement 12.4
        """
        priority = get_job_priority(image_count)
        assert priority.queue == QUEUE_LOW_PRIORITY, (
            f"Expected low priority queue for {image_count} images, got '{priority.queue}'"
        )
        assert priority.priority == PRIORITY_LOW

    @given(
        small_count=st.integers(min_value=1, max_value=19),
        large_count=st.integers(min_value=51, max_value=200),
    )
    @settings(max_examples=50, deadline=None)
    def test_smaller_jobs_have_higher_priority_than_larger(self, small_count, large_count):
        """
        Jobs with fewer images SHALL have higher priority (lower priority number).
        Validates: Requirement 12.4
        """
        small_priority = get_job_priority(small_count)
        large_priority = get_job_priority(large_count)

        assert small_priority.priority < large_priority.priority, (
            f"Small job ({small_count} images, priority={small_priority.priority}) "
            f"should have higher priority than large job "
            f"({large_count} images, priority={large_priority.priority})"
        )
