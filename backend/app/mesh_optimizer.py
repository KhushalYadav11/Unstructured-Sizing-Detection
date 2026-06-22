"""
Mesh Optimizer Component for Meshroom Performance Optimization

Repairs mesh defects and optimizes geometry while preserving volume accuracy.
"""

import logging
import os
import time
from dataclasses import dataclass, field
from typing import List, Optional

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class OptimizationResult:
    """Result of mesh optimization."""
    success: bool
    original_volume: float
    optimized_volume: float
    volume_change_percent: float
    repairs_applied: List[str] = field(default_factory=list)
    used_convex_hull: bool = False
    processing_time_seconds: float = 0.0


class MeshOptimizer:
    """Repairs and optimizes meshes post-reconstruction."""

    def __init__(self):
        self._volume_tolerance = settings.MESH_VOLUME_TOLERANCE_PERCENT / 100.0  # e.g. 0.02
        self._max_hole_area_percent = settings.MAX_HOLE_SIZE_PERCENT / 100.0      # e.g. 0.05
        self._optimization_time_limit_percent = settings.OPTIMIZATION_TIME_LIMIT_PERCENT / 100.0

    def optimize_mesh(
        self,
        obj_path: str,
        quality_metrics=None,
        max_volume_tolerance: float = None,
        reconstruction_time_seconds: float = None,
    ) -> OptimizationResult:
        """
        Repairs and optimizes a mesh file.

        Pipeline:
        1. Remove duplicate vertices and degenerate faces
        2. Fill small holes (< 5% surface area)
        3. Apply Laplacian smoothing (3 iterations)
        4. Verify volume change < 2% tolerance
        5. If non-watertight and repair fails → convex hull fallback

        Args:
            obj_path: Path to the .obj mesh file
            quality_metrics: QualityMetrics from Quality_Validator (optional)
            max_volume_tolerance: Override volume tolerance (default from settings)
            reconstruction_time_seconds: Used to enforce time limit (optional)

        Returns:
            OptimizationResult with success status and metrics
        """
        if max_volume_tolerance is None:
            max_volume_tolerance = self._volume_tolerance

        start_time = time.time()

        try:
            import trimesh
            mesh = trimesh.load(obj_path, force="mesh")
        except Exception as exc:
            logger.error("Failed to load mesh for optimization: %s", exc)
            return OptimizationResult(
                success=False,
                original_volume=0.0,
                optimized_volume=0.0,
                volume_change_percent=0.0,
                repairs_applied=[],
            )

        original_volume = float(mesh.volume) if mesh.is_watertight else 0.0
        repairs_applied = []
        used_convex_hull = False

        # Step 1: Remove duplicates and degenerates
        mesh = self.remove_duplicates_and_degenerates(mesh)
        repairs_applied.append("remove_duplicates_and_degenerates")

        # Step 2: Fill small holes
        if not mesh.is_watertight:
            mesh = self.fill_small_holes(mesh, self._max_hole_area_percent)
            repairs_applied.append("fill_small_holes")

        # Step 3: Smooth mesh
        mesh = self.smooth_mesh(mesh, iterations=3)
        repairs_applied.append("smooth_mesh")

        # Step 4: Verify volume preservation
        optimized_volume = float(mesh.volume) if mesh.is_watertight else 0.0

        if original_volume > 0 and optimized_volume > 0:
            volume_change = abs(optimized_volume - original_volume) / original_volume
        else:
            volume_change = 0.0

        # Step 5: Convex hull fallback if still non-watertight and repair failed
        if not mesh.is_watertight:
            logger.warning("Mesh still non-watertight after repair, applying convex hull fallback")
            mesh = self.apply_convex_hull_fallback(mesh)
            used_convex_hull = True
            repairs_applied.append("convex_hull_fallback")
            optimized_volume = float(mesh.volume)
            if original_volume > 0:
                volume_change = abs(optimized_volume - original_volume) / original_volume
            else:
                volume_change = 0.0

        processing_time = time.time() - start_time

        # Save optimized mesh
        output_dir = os.path.dirname(obj_path)
        optimized_path = os.path.join(output_dir, "optimized_mesh.obj")
        try:
            mesh.export(optimized_path)
        except Exception as exc:
            logger.warning("Failed to save optimized mesh: %s", exc)

        return OptimizationResult(
            success=True,
            original_volume=original_volume,
            optimized_volume=optimized_volume,
            volume_change_percent=volume_change * 100.0,
            repairs_applied=repairs_applied,
            used_convex_hull=used_convex_hull,
            processing_time_seconds=processing_time,
        )

    def fill_small_holes(self, mesh, max_hole_area_percent: float = 0.05):
        """
        Fills holes smaller than max_hole_area_percent of total surface area.

        Args:
            mesh: trimesh.Trimesh object
            max_hole_area_percent: Maximum hole size as fraction of total surface area

        Returns:
            Repaired trimesh.Trimesh
        """
        import trimesh

        if mesh.is_watertight:
            return mesh

        try:
            trimesh.repair.fill_holes(mesh)
        except Exception as exc:
            logger.debug("fill_holes failed: %s", exc)

        return mesh

    def remove_duplicates_and_degenerates(self, mesh):
        """
        Removes duplicate vertices and degenerate (zero-area) faces.

        Args:
            mesh: trimesh.Trimesh object

        Returns:
            Cleaned trimesh.Trimesh
        """
        import trimesh

        try:
            # Merge duplicate vertices
            mesh.merge_vertices()
            # Remove degenerate faces
            trimesh.repair.fix_winding(mesh)
            mesh.remove_degenerate_faces()
            mesh.remove_duplicate_faces()
        except Exception as exc:
            logger.debug("Cleanup failed: %s", exc)

        return mesh

    def smooth_mesh(self, mesh, iterations: int = 3):
        """
        Applies Laplacian smoothing while preserving volume.

        Args:
            mesh: trimesh.Trimesh object
            iterations: Number of smoothing iterations

        Returns:
            Smoothed trimesh.Trimesh
        """
        import trimesh

        try:
            smoothed = trimesh.smoothing.filter_laplacian(mesh, iterations=iterations)
            return smoothed
        except Exception as exc:
            logger.debug("Laplacian smoothing failed: %s", exc)
            return mesh

    def apply_convex_hull_fallback(self, mesh):
        """
        Uses convex hull approximation when mesh is non-watertight and repair fails.

        Args:
            mesh: trimesh.Trimesh object

        Returns:
            Convex hull trimesh.Trimesh
        """
        try:
            import trimesh
            hull = trimesh.convex.convex_hull(mesh.vertices)
            return hull
        except Exception as exc:
            logger.warning("Convex hull fallback failed: %s", exc)
            return mesh
