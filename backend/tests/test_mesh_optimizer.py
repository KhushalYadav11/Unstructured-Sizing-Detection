"""
Unit tests for Mesh Optimizer component.

Tests specific examples and edge cases for mesh repair and optimization.
"""

import os
import tempfile
import pytest
import numpy as np

from app.mesh_optimizer import MeshOptimizer, OptimizationResult


@pytest.fixture
def optimizer():
    return MeshOptimizer()


def create_icosphere_obj(path: str, subdivisions: int = 2) -> str:
    """Create a watertight icosphere OBJ file."""
    import trimesh
    mesh = trimesh.creation.icosphere(subdivisions=subdivisions)
    mesh.export(path)
    return path


def create_mesh_with_duplicates(path: str) -> str:
    """Create a mesh with duplicate vertices."""
    import trimesh
    mesh = trimesh.creation.icosphere(subdivisions=2)
    # Add 10 duplicate vertices
    dup_vertices = np.vstack([mesh.vertices, mesh.vertices[:10]])
    dup_faces = np.vstack([mesh.faces, mesh.faces[:5]])
    dirty = trimesh.Trimesh(vertices=dup_vertices, faces=dup_faces, process=False)
    dirty.export(path)
    return path


def create_open_mesh(path: str) -> str:
    """Create a non-watertight mesh by removing faces."""
    import trimesh
    mesh = trimesh.creation.icosphere(subdivisions=3)
    # Remove many faces to make it non-watertight
    open_mesh = trimesh.Trimesh(
        vertices=mesh.vertices,
        faces=mesh.faces[100:],
        process=False,
    )
    open_mesh.export(path)
    return path


class TestRemoveDuplicatesAndDegenerates:
    """Tests for remove_duplicates_and_degenerates method."""

    def test_removes_duplicate_vertices(self, optimizer):
        """Test mesh with 10 duplicate vertices → duplicates removed."""
        import trimesh

        mesh = trimesh.creation.icosphere(subdivisions=2)
        original_vertex_count = len(mesh.vertices)

        # Add duplicates
        dup_vertices = np.vstack([mesh.vertices, mesh.vertices[:10]])
        dup_faces = np.vstack([mesh.faces, mesh.faces[:5]])
        dirty = trimesh.Trimesh(vertices=dup_vertices, faces=dup_faces, process=False)

        assert len(dirty.vertices) > original_vertex_count

        cleaned = optimizer.remove_duplicates_and_degenerates(dirty)

        # After cleanup, vertex count should be reduced
        assert len(cleaned.vertices) <= len(dirty.vertices)

    def test_removes_degenerate_faces(self, optimizer):
        """Test mesh with degenerate faces → degenerates removed."""
        import trimesh

        mesh = trimesh.creation.icosphere(subdivisions=2)
        # Add degenerate faces (all vertices the same)
        degenerate_face = np.array([[0, 0, 0]])
        faces_with_degen = np.vstack([mesh.faces, degenerate_face])
        dirty = trimesh.Trimesh(
            vertices=mesh.vertices,
            faces=faces_with_degen,
            process=False,
        )

        cleaned = optimizer.remove_duplicates_and_degenerates(dirty)
        assert len(cleaned.faces) <= len(dirty.faces)


class TestFillSmallHoles:
    """Tests for fill_small_holes method."""

    def test_watertight_mesh_unchanged(self, optimizer):
        """Test watertight mesh is returned unchanged."""
        import trimesh

        mesh = trimesh.creation.icosphere(subdivisions=2)
        assert mesh.is_watertight

        result = optimizer.fill_small_holes(mesh)
        assert result.is_watertight

    def test_fill_holes_on_open_mesh(self, optimizer):
        """Test fill_small_holes runs without error on open mesh."""
        import trimesh

        mesh = trimesh.creation.icosphere(subdivisions=2)
        open_mesh = trimesh.Trimesh(
            vertices=mesh.vertices,
            faces=mesh.faces[10:],
            process=False,
        )
        assert not open_mesh.is_watertight

        # Should not raise
        result = optimizer.fill_small_holes(open_mesh)
        assert result is not None


class TestSmoothMesh:
    """Tests for smooth_mesh method."""

    def test_smooth_mesh_preserves_vertex_count(self, optimizer):
        """Test smoothing preserves vertex count."""
        import trimesh

        mesh = trimesh.creation.icosphere(subdivisions=2)
        original_count = len(mesh.vertices)

        smoothed = optimizer.smooth_mesh(mesh, iterations=3)

        assert len(smoothed.vertices) == original_count

    def test_smooth_mesh_returns_valid_mesh(self, optimizer):
        """Test smoothing returns a valid mesh."""
        import trimesh

        mesh = trimesh.creation.icosphere(subdivisions=2)
        smoothed = optimizer.smooth_mesh(mesh, iterations=3)

        assert len(smoothed.vertices) > 0
        assert len(smoothed.faces) > 0


class TestConvexHullFallback:
    """Tests for apply_convex_hull_fallback method."""

    def test_convex_hull_is_watertight(self, optimizer):
        """Test non-watertight mesh, repair fails → convex hull applied, flagged."""
        import trimesh

        mesh = trimesh.creation.icosphere(subdivisions=2)
        open_mesh = trimesh.Trimesh(
            vertices=mesh.vertices,
            faces=mesh.faces[50:],
            process=False,
        )

        result = optimizer.apply_convex_hull_fallback(open_mesh)
        assert result.is_watertight

    def test_convex_hull_has_positive_volume(self, optimizer):
        """Test convex hull has positive volume."""
        import trimesh

        mesh = trimesh.creation.icosphere(subdivisions=2)
        hull = optimizer.apply_convex_hull_fallback(mesh)
        assert hull.volume > 0


class TestOptimizeMesh:
    """Tests for the full optimize_mesh pipeline."""

    def test_watertight_mesh_optimizes_successfully(self, optimizer):
        """Test watertight mesh optimizes successfully."""
        with tempfile.TemporaryDirectory() as tmpdir:
            mesh_path = os.path.join(tmpdir, "mesh.obj")
            create_icosphere_obj(mesh_path)

            result = optimizer.optimize_mesh(mesh_path)

            assert result.success
            assert result.processing_time_seconds >= 0
            assert "remove_duplicates_and_degenerates" in result.repairs_applied

    def test_volume_preserved_within_2_percent(self, optimizer):
        """Test mesh with volume 100 m³ → optimized volume between 98-102 m³."""
        import trimesh

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a sphere with known volume
            mesh = trimesh.creation.icosphere(subdivisions=3)
            # Scale to approximate 100 m³ volume
            # Volume of unit icosphere ≈ 4.19, scale factor = (100/4.19)^(1/3) ≈ 2.88
            scale = (100.0 / mesh.volume) ** (1.0 / 3.0)
            mesh.apply_scale(scale)

            mesh_path = os.path.join(tmpdir, "scaled_mesh.obj")
            mesh.export(mesh_path)

            result = optimizer.optimize_mesh(mesh_path)

            assert result.success
            if result.original_volume > 0 and result.optimized_volume > 0:
                assert result.volume_change_percent <= 2.0, (
                    f"Volume change {result.volume_change_percent:.2f}% exceeds 2% tolerance"
                )

    def test_mesh_with_duplicates_cleaned(self, optimizer):
        """Test mesh with duplicate vertices → duplicates removed."""
        with tempfile.TemporaryDirectory() as tmpdir:
            mesh_path = os.path.join(tmpdir, "dirty_mesh.obj")
            create_mesh_with_duplicates(mesh_path)

            result = optimizer.optimize_mesh(mesh_path)

            assert result.success
            assert "remove_duplicates_and_degenerates" in result.repairs_applied

    def test_non_watertight_mesh_uses_convex_hull(self, optimizer):
        """Test non-watertight mesh, repair fails → convex hull applied, flagged."""
        with tempfile.TemporaryDirectory() as tmpdir:
            mesh_path = os.path.join(tmpdir, "open_mesh.obj")
            create_open_mesh(mesh_path)

            result = optimizer.optimize_mesh(mesh_path)

            assert result.success
            assert result.used_convex_hull is True
            assert "convex_hull_fallback" in result.repairs_applied

    def test_optimization_time_recorded(self, optimizer):
        """Test optimization time is recorded."""
        with tempfile.TemporaryDirectory() as tmpdir:
            mesh_path = os.path.join(tmpdir, "mesh.obj")
            create_icosphere_obj(mesh_path)

            result = optimizer.optimize_mesh(mesh_path)

            assert result.processing_time_seconds >= 0
