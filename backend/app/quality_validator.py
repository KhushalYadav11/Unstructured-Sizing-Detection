"""
Quality Validator Component for Meshroom Performance Optimization

Assesses mesh quality and calculates comprehensive quality metrics.
"""

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

# Quality score weights
_WEIGHTS = {
    "watertightness": 0.30,
    "topology": 0.30,
    "reconstruction": 0.20,
    "texture": 0.20,
}

# Low quality threshold
LOW_QUALITY_THRESHOLD = 50


@dataclass
class QualityMetrics:
    """Comprehensive quality metrics for a reconstructed mesh."""
    quality_score: int = 0                      # 0-100
    is_watertight: bool = False
    watertightness_percent: float = 0.0
    vertex_count: int = 0
    face_count: int = 0
    surface_area: float = 0.0
    hole_count: int = 0
    non_manifold_edges: int = 0
    degenerate_faces: int = 0
    reprojection_error_mean: float = 0.0
    reprojection_error_std: float = 0.0
    camera_poses_reconstructed: int = 0
    camera_poses_total: int = 0
    point_cloud_density: float = 0.0
    texture_resolution: Tuple[int, int] = (0, 0)
    texture_coverage_percent: float = 0.0


class QualityValidator:
    """Assesses mesh quality and calculates comprehensive quality metrics."""

    def validate_mesh(
        self,
        obj_path: str,
        meshroom_output_dir: str = "",
    ) -> QualityMetrics:
        """
        Performs comprehensive quality validation on a reconstructed mesh.

        Args:
            obj_path: Path to the .obj mesh file
            meshroom_output_dir: Directory containing Meshroom output logs

        Returns:
            QualityMetrics with all computed metrics

        Raises:
            FileNotFoundError: If obj_path does not exist
            ValueError: If the mesh cannot be loaded
        """
        if not os.path.exists(obj_path):
            raise FileNotFoundError(f"Mesh file not found: {obj_path}")

        try:
            import trimesh
            mesh = trimesh.load(obj_path, force="mesh")
        except Exception as exc:
            raise ValueError(f"Failed to load mesh from {obj_path}: {exc}") from exc

        metrics = QualityMetrics()

        # Topology assessment
        topology = self.assess_mesh_topology(mesh)
        metrics.is_watertight = topology["is_watertight"]
        metrics.watertightness_percent = topology["watertightness_percent"]
        metrics.vertex_count = topology["vertex_count"]
        metrics.face_count = topology["face_count"]
        metrics.surface_area = topology["surface_area"]
        metrics.hole_count = topology["hole_count"]
        metrics.non_manifold_edges = topology["non_manifold_edges"]
        metrics.degenerate_faces = topology["degenerate_faces"]

        # Reconstruction metrics from Meshroom logs
        if meshroom_output_dir and os.path.isdir(meshroom_output_dir):
            recon = self.parse_reconstruction_metrics(meshroom_output_dir)
            metrics.reprojection_error_mean = recon.get("reprojection_error_mean", 0.0)
            metrics.reprojection_error_std = recon.get("reprojection_error_std", 0.0)
            metrics.camera_poses_reconstructed = recon.get("camera_poses_reconstructed", 0)
            metrics.camera_poses_total = recon.get("camera_poses_total", 0)
            metrics.point_cloud_density = recon.get("point_cloud_density", 0.0)
            metrics.texture_resolution = recon.get("texture_resolution", (0, 0))
            metrics.texture_coverage_percent = recon.get("texture_coverage_percent", 0.0)

        # Calculate overall quality score
        metrics.quality_score = self.calculate_quality_score(metrics)

        return metrics

    def calculate_quality_score(self, metrics: QualityMetrics) -> int:
        """
        Calculates overall quality score (0-100) using weighted formula.

        Formula:
            watertightness_score = 100 if watertight else watertightness_percent
            topology_score = 100 - min(hole_count * 10, 100)
            reconstruction_score = (poses_reconstructed / poses_total * 100) if poses_total > 0 else 50
            texture_score = texture_coverage_percent

        Args:
            metrics: QualityMetrics to score

        Returns:
            Integer quality score in range [0, 100]
        """
        watertightness_score = (
            100.0 if metrics.is_watertight else metrics.watertightness_percent
        )

        topology_score = max(0.0, 100.0 - min(metrics.hole_count * 10.0, 100.0))

        if metrics.camera_poses_total > 0:
            reconstruction_score = (
                metrics.camera_poses_reconstructed / metrics.camera_poses_total * 100.0
            )
        else:
            # No reconstruction data available — use neutral score
            reconstruction_score = 50.0

        texture_score = metrics.texture_coverage_percent

        weighted = (
            _WEIGHTS["watertightness"] * watertightness_score
            + _WEIGHTS["topology"] * topology_score
            + _WEIGHTS["reconstruction"] * reconstruction_score
            + _WEIGHTS["texture"] * texture_score
        )

        score = max(0, min(100, int(round(weighted))))
        return score

    def assess_mesh_topology(self, mesh) -> Dict[str, Any]:
        """
        Checks watertightness, holes, non-manifold edges, and degenerate faces.

        Args:
            mesh: trimesh.Trimesh object

        Returns:
            Dict with topology metrics
        """
        import trimesh

        is_watertight = bool(mesh.is_watertight)

        # Watertightness percentage: based on boundary edges
        # A watertight mesh has 0 boundary edges
        try:
            boundary_edges = len(mesh.faces_unique_edges) - len(mesh.edges_unique)
            # Rough estimate: fewer boundary edges → more watertight
            total_edges = max(len(mesh.edges_unique), 1)
            open_ratio = max(0.0, min(1.0, abs(boundary_edges) / total_edges))
            watertightness_percent = (1.0 - open_ratio) * 100.0
        except Exception:
            watertightness_percent = 100.0 if is_watertight else 0.0

        # Hole count: number of boundary loops
        try:
            hole_count = len(trimesh.graph.connected_components(
                mesh.edges[~mesh.edges_unique_mask]
            )) if not is_watertight else 0
        except Exception:
            hole_count = 0 if is_watertight else 1

        # Non-manifold edges
        try:
            non_manifold_edges = int((~mesh.edges_unique_mask).sum())
        except Exception:
            non_manifold_edges = 0

        # Degenerate faces (zero-area triangles)
        try:
            areas = mesh.area_faces
            degenerate_faces = int((areas < 1e-10).sum())
        except Exception:
            degenerate_faces = 0

        return {
            "is_watertight": is_watertight,
            "watertightness_percent": round(watertightness_percent, 2),
            "vertex_count": len(mesh.vertices),
            "face_count": len(mesh.faces),
            "surface_area": float(mesh.area),
            "hole_count": hole_count,
            "non_manifold_edges": non_manifold_edges,
            "degenerate_faces": degenerate_faces,
        }

    def parse_reconstruction_metrics(self, output_dir: str) -> Dict[str, Any]:
        """
        Extracts reprojection error and camera pose data from Meshroom logs.

        Looks for JSON files in the output directory that contain SfM statistics.

        Args:
            output_dir: Path to Meshroom output directory

        Returns:
            Dict with reconstruction metrics (defaults to zeros if not found)
        """
        defaults = {
            "reprojection_error_mean": 0.0,
            "reprojection_error_std": 0.0,
            "camera_poses_reconstructed": 0,
            "camera_poses_total": 0,
            "point_cloud_density": 0.0,
            "texture_resolution": (0, 0),
            "texture_coverage_percent": 0.0,
        }

        # Search for Meshroom SfM stats JSON files
        for root, _, files in os.walk(output_dir):
            for fname in files:
                if fname.endswith(".json") and "sfm" in fname.lower():
                    try:
                        fpath = os.path.join(root, fname)
                        with open(fpath, "r", encoding="utf-8") as f:
                            data = json.load(f)
                        return self._extract_sfm_metrics(data, defaults)
                    except Exception as exc:
                        logger.debug("Failed to parse %s: %s", fname, exc)

        return defaults

    def should_flag_low_quality(self, score: int) -> bool:
        """
        Returns True if quality score is below the low-quality threshold (50).

        Args:
            score: Quality score (0-100)

        Returns:
            True if score < 50
        """
        return score < LOW_QUALITY_THRESHOLD

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _extract_sfm_metrics(
        self, data: Dict[str, Any], defaults: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Extract metrics from a parsed SfM JSON dict."""
        result = dict(defaults)

        # Try common Meshroom JSON field names
        if "reprojectionError" in data:
            result["reprojection_error_mean"] = float(data["reprojectionError"].get("mean", 0.0))
            result["reprojection_error_std"] = float(data["reprojectionError"].get("std", 0.0))

        if "views" in data:
            result["camera_poses_total"] = len(data["views"])

        if "poses" in data:
            result["camera_poses_reconstructed"] = len(data["poses"])

        if "structure" in data:
            result["point_cloud_density"] = float(len(data["structure"]))

        return result
