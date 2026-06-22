"""
Priority Queue Component for Meshroom Performance Optimization

Implements priority-based job ordering where jobs with fewer images
are processed before larger jobs (faster jobs first).
"""

import logging
from dataclasses import dataclass
from typing import List, Optional

logger = logging.getLogger(__name__)

# Celery queue names
QUEUE_HIGH_PRIORITY = "meshroom_high"    # < 20 images (fast)
QUEUE_MEDIUM_PRIORITY = "meshroom_medium"  # 20-50 images (balanced)
QUEUE_LOW_PRIORITY = "meshroom_low"      # > 50 images (quality)

# Priority values (lower number = higher priority in Celery)
PRIORITY_HIGH = 1
PRIORITY_MEDIUM = 5
PRIORITY_LOW = 9


@dataclass
class JobPriority:
    """Priority assignment for a job."""
    job_id: int
    image_count: int
    queue: str
    priority: int


def get_job_priority(image_count: int) -> JobPriority:
    """
    Determines the queue and priority for a job based on image count.

    Jobs with fewer images get higher priority (processed first).

    Args:
        image_count: Number of input images

    Returns:
        JobPriority with queue name and priority value
    """
    if image_count < 20:
        return JobPriority(
            job_id=0,
            image_count=image_count,
            queue=QUEUE_HIGH_PRIORITY,
            priority=PRIORITY_HIGH,
        )
    elif image_count <= 50:
        return JobPriority(
            job_id=0,
            image_count=image_count,
            queue=QUEUE_MEDIUM_PRIORITY,
            priority=PRIORITY_MEDIUM,
        )
    else:
        return JobPriority(
            job_id=0,
            image_count=image_count,
            queue=QUEUE_LOW_PRIORITY,
            priority=PRIORITY_LOW,
        )


def sort_jobs_by_priority(jobs: List[dict]) -> List[dict]:
    """
    Sorts a list of job dicts by image count (ascending = higher priority first).

    Args:
        jobs: List of dicts with at least 'image_count' key

    Returns:
        Sorted list with fewer-image jobs first
    """
    return sorted(jobs, key=lambda j: j.get("image_count", 0))


class MeshroomTaskRouter:
    """
    Custom Celery task router that routes jobs to priority queues
    based on image count.
    """

    def route_for_task(self, task: str, args=None, kwargs=None, **options) -> Optional[dict]:
        """
        Routes a Celery task to the appropriate priority queue.

        Args:
            task: Task name (e.g., 'app.tasks.run_meshroom_job')
            args: Task positional arguments
            kwargs: Task keyword arguments

        Returns:
            Dict with 'queue' and 'priority' keys, or None for default routing
        """
        if task != "app.tasks.run_meshroom_job":
            return None

        # Extract image count from input_path if available
        # In practice, we'd look up the job's image count from the database
        # For routing purposes, we use a default medium priority
        # The actual priority is set when the task is dispatched
        return {
            "queue": QUEUE_MEDIUM_PRIORITY,
            "priority": PRIORITY_MEDIUM,
        }


def dispatch_job_with_priority(
    task_func,
    job_id: int,
    input_path: str,
    image_count: int,
) -> None:
    """
    Dispatches a Meshroom job to the appropriate priority queue.

    Args:
        task_func: The Celery task function (run_meshroom_job)
        job_id: Job ID
        input_path: Path to input images
        image_count: Number of input images (determines priority)
    """
    priority_info = get_job_priority(image_count)
    priority_info.job_id = job_id

    logger.info(
        "Dispatching job %d (image_count=%d) to queue '%s' with priority %d",
        job_id,
        image_count,
        priority_info.queue,
        priority_info.priority,
    )

    task_func.apply_async(
        args=[job_id, input_path],
        queue=priority_info.queue,
        priority=priority_info.priority,
    )
