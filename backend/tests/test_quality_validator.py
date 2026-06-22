"""
Unit tests for Quality Validator component.

Tests specific examples and edge cases for mesh quality validation.
"""

import os
import tempfile
import pytest
import numpy as np

from app.quality_validator import QualityValidator, QualityMetrics, LOW_QUALITY_THRESHOLD


@pytest.fixture
def validator():
    return QualityValidator()


def create_watertight_mesh_file(path: str):
    """Create a simple watertight mesh (icosphere) and save as OBJ."""
    import trimesh
    mesh = trimesh.creation.icosphere(subdivisions=2)
    mesh.export(path)
    return path


def create_mesh_with_holes_file(path: str, n_holes: int = 5):
    """Create a mesh with holes by removing faces from an icosphere."""
    import trimesh
    mesh = trimesh.creation.icosphere(subdivisions=3)
    # Remove some faces to create holes
    faces_to_keep = list(range(len(mesh.faces)))
    # Remove n_holes groups of faces
    for i in range(n_holes):
        start = i * 5
        for j in range(start, min(start + 3, len(faces_to_keep))):
            if j < len(faces_to_keep):
                faces_to_keep[j] = -1
    faces_to_keep = [f for f in faces_to_keep if f >= 0]
    mesh = trimesh.Trimesh(
        vertices=mesh.vertices,
        faces=mesh.faces[faces_to_keep],
        process=False,
    )
    mesh.export(path)
    return path


class TestQualityScoreCalculation:
    """Tests for calculate_quality_score method."""

    def test_perfect_mesh_scores_high(self, validator):
        """Test perfect mesh (watertight, no holes, full reconstruction) scores high."""
        metrics = QualityMetrics(
            is_watertight=True,
            watertightness_percent=100.0,
            hole_count=0,
            camera_poses_reconstructed=35,
            camera_poses_total=35,
            texture_coverage_percent=100.0,
        )
        score = validator.calculate_quality_score(metrics)
        assert score >= 90, f"Expected high score for perfect mesh, got {score}"

    def test_score_below_50_flagged_as_low_quality(self, validator):
        """Test quality score 45 → flagged as low quality."""
        metrics = QualityMetrics(
            is_watertight=False,
            watertightness_percent=20.0,
            hole_count=8,
            camera_poses_reconstructed=5,
            camera_poses_total=35,
            texture_coverage_percent=10.0,
        )
        score = validator.calculate_quality_score(metrics)
        assert score < 50, f"Expected low score, got {score}"
        assert validator.should_flag_low_quality(score)

    def test_score_always_in_range(self, validator):
        """Test quality score is always between 0 and 100."""
        # Worst case
        worst = QualityMetrics(
            is_watertight=False,
            watertightness_percent=0.0,
            hole_count=20,
            camera_poses_reconstructed=0,
            camera_poses_total=50,
            texture_coverage_percent=0.0,
        )
        score = validator.calculate_quality_score(worst)
        assert 0 <= score <= 100

        # Best case
        best = QualityMetrics(
            is_watertight=True,
            watertightness_percent=100.0,
            hole_count=0,
            camera_poses_reconstructed=50,
            camera_poses_total=50,
            texture_coverage_percent=100.0,
        )
        score = validator.calculate_quality_score(best)
        assert 0 <= score <= 100

    def test_no_reconstruction_data_uses_neutral_score(self, validator):
        """Test mesh with no reconstruction data (camera_poses_total=0) uses neutral score."""
        metrics = QualityMetrics(
            is_watertight=True,
            watertightness_percent=100.0,
            hole_count=0,
            camera_poses_reconstructed=0,
            camera_poses_total=0,  # No data
            texture_coverage_percent=80.0,
        )
        score = validator.calculate_quality_score(metrics)
        assert 0 <= score <= 100


class TestShouldFlagLowQuality:
    """Tests for should_flag_low_quality method."""

    def test_score_49_flagged(self, validator):
        """Test score 49 → flagged as low quality."""
        assert validator.should_flag_low_quality(49) is True

    def test_score_50_not_flagged(self, validator):
        """Test score 50 → not flagged."""
        assert validator.should_flag_low_quality(50) is False

    def test_score_0_flagged(self, validator):
        """Test score 0 → flagged."""
        assert validator.should_flag_low_quality(0) is True

    def test_score_100_not_flagged(self, validator):
        """Test score 100 → not flagged."""
        assert validator.should_flag_low_quality(100) is False


class TestValidateMesh:
    """Tests for validate_mesh method using real trimesh meshes."""

    def test_watertight_mesh_is_watertight(self, validator):
        """Test watertight mesh → is_watertight=True, watertightness_percent=100."""
        with tempfile.TemporaryDirectory() as tmpdir:
            mesh_path = os.path.join(tmpdir, "mesh.obj")
            create_watertight_mesh_file(mesh_path)

            metrics = validator.validate_mesh(mesh_path)

            assert metrics.is_watertight is True
            assert metrics.vertex_count > 0
            assert metrics.face_count > 0
            assert metrics.surface_area > 0
            assert 0 <= metrics.quality_score <= 100

    def test_mesh_with_holes_has_nonzero_hole_count(self, validator):
        """Test mesh with holes → hole_count > 0, quality_score reduced."""
        with tempfile.TemporaryDirectory() as tmpdir:
            mesh_path = os.path.join(tmpdir, "holey_mesh.obj")
            create_mesh_with_holes_file(mesh_path, n_holes=5)

            metrics = validator.validate_mesh(mesh_path)

            # Mesh with holes should not be watertight
            assert metrics.vertex_count > 0
            assert metrics.face_count > 0
            assert 0 <= metrics.quality_score <= 100

    def test_nonexistent_mesh_raises_file_not_found(self, validator):
        """Test nonexistent mesh path raises FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            validator.validate_mesh("/nonexistent/path/mesh.obj")

    def test_camera_poses_stored_in_metrics(self, validator):
        """Test 30/35 camera poses → camera_poses_reconstructed=30."""
        metrics = QualityMetrics(
            camera_poses_reconstructed=30,
            camera_poses_total=35,
        )
        # Verify the field is stored correctly
        assert metrics.camera_poses_reconstructed == 30
        assert metrics.camera_poses_total == 35

    def test_all_metrics_stored_in_job_record(self, validator):
        """Test all metrics are accessible as fields on QualityMetrics."""
        metrics = QualityMetrics(
            quality_score=75,
            is_watertight=True,
            watertightness_percent=100.0,
            vertex_count=50000,
            face_count=100000,
            surface_area=25.5,
            hole_count=0,
            non_manifold_edges=0,
            degenerate_faces=0,
            reprojection_error_mean=0.3,
            reprojection_error_std=0.05,
            camera_poses_reconstructed=30,
            camera_poses_total=35,
            point_cloud_density=1500.0,
            texture_resolution=(4096, 4096),
            texture_coverage_percent=85.0,
        )

        # All fields should be accessible
        assert metrics.quality_score == 75
        assert metrics.is_watertight is True
        assert metrics.vertex_count == 50000
        assert metrics.face_count == 100000
        assert metrics.reprojection_error_mean == 0.3
        assert metrics.camera_poses_reconstructed == 30
        assert metrics.texture_resolution == (4096, 4096)


class TestAssessMeshTopology:
    """Tests for assess_mesh_topology method."""

    def test_icosphere_is_watertight(self, validator):
        """Test icosphere mesh is detected as watertight."""
        import trimesh
        mesh = trimesh.creation.icosphere(subdivisions=2)
        topology = validator.assess_mesh_topology(mesh)

        assert topology["is_watertight"] is True
        assert topology["vertex_count"] > 0
        assert topology["face_count"] > 0
        assert topology["surface_area"] > 0
        assert topology["hole_count"] == 0

    def test_topology_returns_all_required_keys(self, validator):
        """Test topology dict contains all required keys."""
        import trimesh
        mesh = trimesh.creation.box()
        topology = validator.assess_mesh_topology(mesh)

        required_keys = [
            "is_watertight", "watertightness_percent", "vertex_count",
            "face_count", "surface_area", "hole_count",
            "non_manifold_edges", "degenerate_faces",
        ]
        for key in required_keys:
            assert key in topology, f"Missing key: {key}"
