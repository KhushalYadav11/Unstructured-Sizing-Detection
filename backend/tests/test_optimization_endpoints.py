"""
Unit tests for new optimization API endpoints.

Tests progress, quality, preview, retry, and performance metrics endpoints.
"""

import sys
import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch

# Mock database modules before importing app modules
sys.modules.setdefault("psycopg2", MagicMock())
sys.modules.setdefault("celery", MagicMock())
sys.modules.setdefault("redis", MagicMock())

from fastapi.testclient import TestClient
from fastapi import FastAPI

from app.routers.optimization import router as optimization_router, performance_router


# ---------------------------------------------------------------------------
# Test app setup
# ---------------------------------------------------------------------------

def make_test_app():
    """Create a minimal FastAPI app with the optimization router."""
    app = FastAPI()
    app.include_router(optimization_router)
    app.include_router(performance_router)
    return app


def make_mock_job(
    job_id: int = 1,
    status: str = "processing",
    current_stage: str = "reconstruction",
    progress_percent: float = 50.0,
    estimated_remaining_seconds: int = 900,
    quality_score: int = 75,
    quality_metrics: dict = None,
    preview_model_path: str = None,
    preview_ready_at: datetime = None,
    retry_count: int = 0,
    processing_time_seconds: float = 1800.0,
    used_gpu: bool = True,
    input_analysis: dict = None,
    optimization_result: dict = None,
):
    """Create a mock Job object."""
    job = MagicMock()
    job.id = job_id
    job.status = status
    job.current_stage = current_stage
    job.progress_percent = progress_percent
    job.estimated_remaining_seconds = estimated_remaining_seconds
    job.quality_score = quality_score
    job.quality_metrics = quality_metrics or {"quality_score": quality_score}
    job.preview_model_path = preview_model_path
    job.preview_ready_at = preview_ready_at
    job.retry_count = retry_count
    job.processing_time_seconds = processing_time_seconds
    job.used_gpu = used_gpu
    job.input_analysis = input_analysis or {}
    job.optimization_result = optimization_result or {}
    return job


def make_mock_db(job=None):
    """Create a mock database session."""
    db = MagicMock()
    query_mock = MagicMock()
    filter_mock = MagicMock()
    filter_mock.first.return_value = job
    query_mock.filter.return_value = filter_mock
    db.query.return_value = query_mock
    return db


# ---------------------------------------------------------------------------
# Tests for GET /jobs/{id}/progress
# ---------------------------------------------------------------------------

class TestGetJobProgress:
    """Tests for GET /jobs/{job_id}/progress endpoint."""

    def test_returns_stage_and_percent(self):
        """Test GET /jobs/{id}/progress returns stage and percent."""
        job = make_mock_job(
            status="processing",
            current_stage="reconstruction",
            progress_percent=50.0,
            estimated_remaining_seconds=900,
        )
        db = make_mock_db(job)

        app = make_test_app()

        def override_get_db():
            yield db

        from app.deps import get_db
        app.dependency_overrides[get_db] = override_get_db

        client = TestClient(app)
        response = client.get("/jobs/1/progress")

        assert response.status_code == 200
        data = response.json()
        assert data["job_id"] == 1
        assert data["current_stage"] == "reconstruction"
        assert data["progress_percent"] == 50.0
        assert data["estimated_remaining_seconds"] == 900

    def test_returns_404_for_nonexistent_job(self):
        """Test GET /jobs/{id}/progress returns 404 for nonexistent job."""
        db = make_mock_db(job=None)

        app = make_test_app()

        def override_get_db():
            yield db

        from app.deps import get_db
        app.dependency_overrides[get_db] = override_get_db

        client = TestClient(app)
        response = client.get("/jobs/999/progress")

        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Tests for GET /jobs/{id}/quality
# ---------------------------------------------------------------------------

class TestGetJobQuality:
    """Tests for GET /jobs/{job_id}/quality endpoint."""

    def test_returns_quality_score_and_metrics(self):
        """Test GET /jobs/{id}/quality returns quality score and metrics."""
        quality_metrics = {
            "quality_score": 75,
            "is_watertight": True,
            "vertex_count": 50000,
            "face_count": 100000,
        }
        job = make_mock_job(
            status="complete",
            quality_score=75,
            quality_metrics=quality_metrics,
        )
        db = make_mock_db(job)

        app = make_test_app()

        def override_get_db():
            yield db

        from app.deps import get_db
        app.dependency_overrides[get_db] = override_get_db

        client = TestClient(app)
        response = client.get("/jobs/1/quality")

        assert response.status_code == 200
        data = response.json()
        assert data["quality_score"] == 75
        assert "quality_metrics" in data

    def test_returns_404_when_quality_not_available(self):
        """Test GET /jobs/{id}/quality returns 404 when quality not yet computed."""
        job = make_mock_job(status="processing", quality_score=None)
        db = make_mock_db(job)

        app = make_test_app()

        def override_get_db():
            yield db

        from app.deps import get_db
        app.dependency_overrides[get_db] = override_get_db

        client = TestClient(app)
        response = client.get("/jobs/1/quality")

        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Tests for GET /jobs/{id}/preview
# ---------------------------------------------------------------------------

class TestGetJobPreview:
    """Tests for GET /jobs/{job_id}/preview endpoint."""

    def test_returns_preview_path_when_available(self):
        """Test GET /jobs/{id}/preview returns preview path when available."""
        job = make_mock_job(
            status="preview_ready",
            preview_model_path="/results/job_1/preview/mesh.obj",
            preview_ready_at=datetime(2024, 1, 1, 12, 0, 0),
        )
        db = make_mock_db(job)

        app = make_test_app()

        def override_get_db():
            yield db

        from app.deps import get_db
        app.dependency_overrides[get_db] = override_get_db

        client = TestClient(app)
        response = client.get("/jobs/1/preview")

        assert response.status_code == 200
        data = response.json()
        assert data["preview_ready"] is True
        assert data["preview_model_path"] == "/results/job_1/preview/mesh.obj"

    def test_returns_not_ready_when_no_preview(self):
        """Test GET /jobs/{id}/preview returns not ready when no preview."""
        job = make_mock_job(status="processing", preview_model_path=None)
        db = make_mock_db(job)

        app = make_test_app()

        def override_get_db():
            yield db

        from app.deps import get_db
        app.dependency_overrides[get_db] = override_get_db

        client = TestClient(app)
        response = client.get("/jobs/1/preview")

        assert response.status_code == 200
        data = response.json()
        assert data["preview_ready"] is False
        assert data["preview_model_path"] is None


# ---------------------------------------------------------------------------
# Tests for POST /jobs/{id}/retry
# ---------------------------------------------------------------------------

class TestRetryJob:
    """Tests for POST /jobs/{job_id}/retry endpoint."""

    def test_triggers_retry_with_adjusted_parameters(self):
        """Test POST /jobs/{id}/retry triggers retry with adjusted parameters."""
        job = make_mock_job(status="failed", retry_count=0)
        db = make_mock_db(job)

        app = make_test_app()

        def override_get_db():
            yield db

        from app.deps import get_db
        app.dependency_overrides[get_db] = override_get_db

        client = TestClient(app)
        response = client.post("/jobs/1/retry")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "pending"
        assert data["retry_count"] == 1

    def test_returns_400_for_non_failed_job(self):
        """Test POST /jobs/{id}/retry returns 400 for non-failed job."""
        job = make_mock_job(status="processing")
        db = make_mock_db(job)

        app = make_test_app()

        def override_get_db():
            yield db

        from app.deps import get_db
        app.dependency_overrides[get_db] = override_get_db

        client = TestClient(app)
        response = client.post("/jobs/1/retry")

        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Tests for GET /metrics/performance
# ---------------------------------------------------------------------------

class TestGetPerformanceMetrics:
    """Tests for GET /metrics/performance endpoint."""

    def test_returns_aggregated_metrics(self):
        """Test GET /metrics/performance returns aggregated metrics."""
        # Create mock completed jobs
        jobs = [
            make_mock_job(
                job_id=i,
                status="complete",
                processing_time_seconds=1800.0,
                quality_score=75,
                used_gpu=True,
            )
            for i in range(3)
        ]

        db = MagicMock()
        query_mock = MagicMock()
        filter_mock = MagicMock()
        filter_mock.all.return_value = jobs
        query_mock.filter.return_value = filter_mock
        db.query.return_value = query_mock

        app = make_test_app()

        def override_get_db():
            yield db

        from app.deps import get_db
        app.dependency_overrides[get_db] = override_get_db

        client = TestClient(app)
        response = client.get("/metrics/performance")

        assert response.status_code == 200
        data = response.json()
        assert data["total_jobs"] == 3
        assert data["avg_processing_time_seconds"] == 1800.0
        assert data["avg_quality_score"] == 75.0
        assert data["gpu_usage_percent"] == 100.0

    def test_returns_zeros_when_no_completed_jobs(self):
        """Test GET /metrics/performance returns zeros when no completed jobs."""
        db = MagicMock()
        query_mock = MagicMock()
        filter_mock = MagicMock()
        filter_mock.all.return_value = []
        query_mock.filter.return_value = filter_mock
        db.query.return_value = query_mock

        app = make_test_app()

        def override_get_db():
            yield db

        from app.deps import get_db
        app.dependency_overrides[get_db] = override_get_db

        client = TestClient(app)
        response = client.get("/metrics/performance")

        assert response.status_code == 200
        data = response.json()
        assert data["total_jobs"] == 0
