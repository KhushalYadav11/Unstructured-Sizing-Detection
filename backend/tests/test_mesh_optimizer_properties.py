"""
Property-Based Tests for Mesh Optimizer component.

Tests universal correctness properties across all valid inputs using Hypothesis.
"""

import os
import tempfile
import pytest
import numpy as np
from hypothesis import given, strategies as st, settings, assume

from app.mesh_optimizer import MeshOptimizer, OptimizationResult


def create_icosphere_obj(path: str, subdivisions: int = 2) -> str:
    """Create a watertight icosphere OBJ file."""
    import trimesh
    mesh = trimesh.creation.icosphere(subdivisions=subdivisions)
    mesh.export(path)
    return path


def create_box_obj(path: str) -> str:
    """Create a watertight box OBJ file."""
    import trimesh
    mesh = trimesh.creation.box(extents=[1.0, 1.0, 1.0])
    mesh.export(path)
    return path


# ---------------------------------------------------------------------------
# Property 7: Mesh Optimization Volume Preservation
# ---------------------------------------------------------------------------

class TestProperty7VolumePreservation:
    """
    Property 7: Mesh Optimization Volume Preservation
    Validates: Requirements 6.2, 6.3, 6.4
    """

    @given(subdivisions=st.integers(min_value=1, max_value=3))
    @settings(max_examples=10, deadline=None)
    def test_volume_preserved_within_2_percent_after_optimization(self, subdivisions):
        """
        For any watertight mesh, volume SHALL be preserved within 2% after optimization.
        Validates: Requirement 6.4
        """
        import trimesh

        optimizer = MeshOptimizer()

        with tempfile.TemporaryDirectory() as tmpdir:
            mesh_path = os.path.join(tmpdir, "mesh.obj")
            create_icosphere_obj(mesh_path, subdivisions=subdivisions)

            result = optimizer.optimize_mesh(mesh_path)

            assert result.success, "Optimization should succeed"

            if result.original_volume > 0 and result.optimized_volume > 0:
                assert result.volume_change_percent <= 2.0, (
                    f"Volume change {result.volume_change_percent:.2f}% exceeds 2% tolerance "
                    f"(original={result.original_volume:.4f}, "
                    f"optimized={result.optimized_volume:.4f})"
                )

    @given(subdivisions=st.integers(min_value=1, max_value=3))
    @settings(max_examples=10, deadline=None)
    def test_optimization_removes_degenerates(self, subdivisions):
        """
        For any mesh, optimization SHALL remove duplicate vertices and degenerate faces.
        Validates: Requirement 6.3
        """
        import trimesh

        optimizer = MeshOptimizer()

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create mesh with duplicate vertices
            mesh = trimesh.creation.icosphere(subdivisions=subdivisions)
            # Add duplicate vertices by concatenating
            dup_vertices = np.vstack([mesh.vertices, mesh.vertices[:10]])
            dup_faces = np.vstack([mesh.faces, mesh.faces[:5]])
            dirty_mesh = trimesh.Trimesh(vertices=dup_vertices, faces=dup_faces, process=False)

            mesh_path = os.path.join(tmpdir, "dirty_mesh.obj")
            dirty_mesh.export(mesh_path)

            result = optimizer.optimize_mesh(mesh_path)

            assert result.success
            assert "remove_duplicates_and_degenerates" in result.repairs_applied

    @given(subdivisions=st.integers(min_value=1, max_value=3))
    @settings(max_examples=10, deadline=None)
    def test_optimization_result_has_valid_fields(self, subdivisions):
        """
        For any mesh, OptimizationResult SHALL have valid field values.
        Validates: Requirements 6.2, 6.3, 6.4
        """
        optimizer = MeshOptimizer()

        with tempfile.TemporaryDirectory() as tmpdir:
            mesh_path = os.path.join(tmpdir, "mesh.obj")
            create_icosphere_obj(mesh_path, subdivisions=subdivisions)

            result = optimizer.optimize_mesh(mesh_path)

            assert isinstance(result.success, bool)
            assert result.original_volume >= 0
            assert result.optimized_volume >= 0
            assert result.volume_change_percent >= 0
            assert isinstance(result.repairs_applied, list)
            assert isinstance(result.used_convex_hull, bool)
            assert result.processing_time_seconds >= 0


# ---------------------------------------------------------------------------
# Property 8: Mesh Repair with Convex Hull Fallback
# ---------------------------------------------------------------------------

class TestProperty8ConvexHullFallback:
    """
    Property 8: Mesh Repair with Convex Hull Fallback
    Validates: Requirements 6.1, 6.5
    """

    def test_convex_hull_applied_to_non_watertight_mesh(self):
        """
        When mesh is non-watertight and repair fails, convex hull SHALL be applied.
        Validates: Requirement 6.5
        """
        import trimesh

        optimizer = MeshOptimizer()

        # Create a non-watertight mesh by removing faces
        mesh = trimesh.creation.icosphere(subdivisions=2)
        # Remove many faces to make it very non-watertight
        faces_to_keep = mesh.faces[50:]  # Remove first 50 faces
        open_mesh = trimesh.Trimesh(
            vertices=mesh.vertices,
            faces=faces_to_keep,
            process=False,
        )

        result = optimizer.apply_convex_hull_fallback(open_mesh)

        # Convex hull should be watertight
        assert result.is_watertight, "Convex hull result should be watertight"
        assert result.volume > 0, "Convex hull should have positive volume"

    def test_convex_hull_result_is_watertight(self):
        """
        Convex hull fallback SHALL produce a watertight mesh.
        Validates: Requirement 6.5
        """
        import trimesh

        optimizer = MeshOptimizer()

        # Create a simple open mesh from an icosphere
        mesh = trimesh.creation.icosphere(subdivisions=2)
        open_mesh = trimesh.Trimesh(
            vertices=mesh.vertices,
            faces=mesh.faces[30:],
            process=False,
        )

        result = optimizer.apply_convex_hull_fallback(open_mesh)
        assert result.is_watertight
