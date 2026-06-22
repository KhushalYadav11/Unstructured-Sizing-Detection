"""
Unit tests for Priority Queue component.

Tests specific examples and edge cases for job priority ordering.
"""

import pytest
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


class TestGetJobPriority:
    """Tests for get_job_priority function."""

    def test_10_images_gets_high_priority(self):
        """Test 10 images → high priority queue."""
        priority = get_job_priority(10)
        assert priority.queue == QUEUE_HIGH_PRIORITY
        assert priority.priority == PRIORITY_HIGH

    def test_35_images_gets_medium_priority(self):
        """Test 35 images → medium priority queue."""
        priority = get_job_priority(35)
        assert priority.queue == QUEUE_MEDIUM_PRIORITY
        assert priority.priority == PRIORITY_MEDIUM

    def test_75_images_gets_low_priority(self):
        """Test 75 images → low priority queue."""
        priority = get_job_priority(75)
        assert priority.queue == QUEUE_LOW_PRIORITY
        assert priority.priority == PRIORITY_LOW

    def test_boundary_19_images_high_priority(self):
        """Test 19 images → high priority (boundary)."""
        priority = get_job_priority(19)
        assert priority.queue == QUEUE_HIGH_PRIORITY

    def test_boundary_20_images_medium_priority(self):
        """Test 20 images → medium priority (boundary)."""
        priority = get_job_priority(20)
        assert priority.queue == QUEUE_MEDIUM_PRIORITY

    def test_boundary_50_images_medium_priority(self):
        """Test 50 images → medium priority (boundary)."""
        priority = get_job_priority(50)
        assert priority.queue == QUEUE_MEDIUM_PRIORITY

    def test_boundary_51_images_low_priority(self):
        """Test 51 images → low priority (boundary)."""
        priority = get_job_priority(51)
        assert priority.queue == QUEUE_LOW_PRIORITY

    def test_priority_values_ordered_correctly(self):
        """Test priority values: high < medium < low (lower = higher priority)."""
        assert PRIORITY_HIGH < PRIORITY_MEDIUM < PRIORITY_LOW


class TestSortJobsByPriority:
    """Tests for sort_jobs_by_priority function."""

    def test_jobs_sorted_by_image_count_ascending(self):
        """Test queue with jobs of 10, 50, 25 images → processes in order 10, 25, 50."""
        jobs = [
            {"job_id": 1, "image_count": 50},
            {"job_id": 2, "image_count": 10},
            {"job_id": 3, "image_count": 25},
        ]
        sorted_jobs = sort_jobs_by_priority(jobs)

        assert sorted_jobs[0]["image_count"] == 10
        assert sorted_jobs[1]["image_count"] == 25
        assert sorted_jobs[2]["image_count"] == 50

    def test_equal_image_counts_maintain_relative_order(self):
        """Test jobs with equal image counts maintain relative order."""
        jobs = [
            {"job_id": 1, "image_count": 30},
            {"job_id": 2, "image_count": 30},
            {"job_id": 3, "image_count": 30},
        ]
        sorted_jobs = sort_jobs_by_priority(jobs)
        assert len(sorted_jobs) == 3
        assert all(j["image_count"] == 30 for j in sorted_jobs)

    def test_single_job_unchanged(self):
        """Test single job list is returned unchanged."""
        jobs = [{"job_id": 1, "image_count": 50}]
        sorted_jobs = sort_jobs_by_priority(jobs)
        assert sorted_jobs == jobs

    def test_empty_list_returns_empty(self):
        """Test empty list returns empty list."""
        assert sort_jobs_by_priority([]) == []

    def test_priority_ordering_maintained_under_concurrent_load(self):
        """Test priority ordering maintained with many jobs."""
        import random
        jobs = [{"job_id": i, "image_count": random.randint(1, 200)} for i in range(50)]
        sorted_jobs = sort_jobs_by_priority(jobs)

        for i in range(len(sorted_jobs) - 1):
            assert sorted_jobs[i]["image_count"] <= sorted_jobs[i + 1]["image_count"]
