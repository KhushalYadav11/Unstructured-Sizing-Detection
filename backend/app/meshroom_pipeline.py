"""
Meshroom Pipeline Builder for High-Quality 3D Reconstruction

Translates MeshroomParameters into optimized Meshroom CLI arguments.
Targets Polycam-level reconstruction quality through careful tuning of
feature extraction, dense MVS depth filtering, meshing, and texturing.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from typing import Dict, Any, List, Optional

from app.parameter_optimizer import MeshroomParameters

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Meshroom feature extractor descriptorType choices
# ---------------------------------------------------------------------------
# "sift"        – fastest, lowest quality
# "sift_float"  – better for high-resolution imagery
# "akaze"       – robust to blur/scale
# "cctag3"      – marker-based (not useful here)
# Default quality choice: sift_float for balanced/quality, sift for fast
DESCRIPTOR_TYPES: Dict[str, str] = {
    "fast": "sift",
    "balanced": "sift_float",
    "quality": "sift_float",
}

# Feature density → Meshroom featureExtraction contrastFiltering threshold
# Lower threshold = more features extracted (higher density)
CONTRAST_THRESHOLDS: Dict[str, float] = {
    "low": 0.04,
    "medium": 0.02,
    "high": 0.01,
    "ultra": 0.005,
}

# Feature density → max features per image
MAX_FEATURES: Dict[str, int] = {
    "low": 5_000,
    "medium": 10_000,
    "high": 20_000,
    "ultra": 40_000,
}

# Mesh quality → Meshroom meshing maxInputPoints / maxPoints
MESH_INPUT_POINTS: Dict[str, int] = {
    "medium": 10_000_000,
    "high": 25_000_000,
    "ultra": 50_000_000,
}

MESH_OUTPUT_POINTS: Dict[str, int] = {
    "medium": 500_000,
    "high": 1_000_000,
    "ultra": 2_000_000,
}

# Mesh quality → MeshFiltering iterations for smoothing
MESH_FILTER_ITERATIONS: Dict[str, int] = {
    "medium": 3,
    "high": 5,
    "ultra": 7,
}

# Texture resolution override (Meshroom texturing uses power-of-2 sizes)
TEXTURE_SIZES: Dict[int, int] = {
    2048: 2048,
    4096: 4096,
    8192: 8192,
}

# MVS depth map quality → DepthMap SGM scale / step
# Lower scale = higher resolution depth maps (slower, better quality)
DEPTH_SGM_SCALE: Dict[str, int] = {
    "fast": 2,
    "balanced": 1,
    "quality": 1,
}

DEPTH_SGM_STEP: Dict[str, int] = {
    "fast": 2,
    "balanced": 1,
    "quality": 1,
}

# Depth map filter settings: how aggressively to filter unreliable depths
DEPTH_FILTER_THICKNESS: Dict[str, float] = {
    "fast": 2.0,
    "balanced": 1.0,
    "quality": 0.5,   # tighter = more accurate surface
}

# Number of consistent views required for a depth sample to survive filtering
DEPTH_FILTER_MIN_VIEWS: Dict[str, int] = {
    "fast": 2,
    "balanced": 3,
    "quality": 4,
}


class MeshroomPipelineBuilder:
    """
    Builds optimized Meshroom CLI arguments from MeshroomParameters.

    Covers all major quality levers:
    - Feature extraction: descriptor type, contrast threshold, max features
    - Depth map estimation: SGM scale/step for MVS quality
    - Depth map filtering: thickness threshold, min consistent views
    - Meshing: input/output point budgets
    - Mesh filtering: smoothing iterations
    - Texturing: resolution
    - Threading and downscale
    """

    def build_command(
        self,
        meshroom_path: str,
        input_path: str,
        output_dir: str,
        params: MeshroomParameters,
        cache_dir: Optional[str] = None,
        pipeline_file: Optional[str] = None,
    ) -> List[str]:
        """
        Builds the complete Meshroom CLI command.

        Args:
            meshroom_path: Path to meshroom_batch executable
            input_path: Path to input images directory
            output_dir: Output directory for reconstruction results
            params: MeshroomParameters with quality settings
            cache_dir: Optional Meshroom cache directory for resumption
            pipeline_file: Optional path to a custom .mg pipeline graph file

        Returns:
            List of command-line arguments ready for subprocess.Popen
        """
        cmd = [
            meshroom_path,
            "--input", input_path,
            "--output", output_dir,
        ]

        # Use custom pipeline graph if provided
        if pipeline_file and os.path.exists(pipeline_file):
            cmd += ["--pipeline", pipeline_file]
            logger.info("Using custom pipeline graph: %s", pipeline_file)

        # Cache directory for stage resumption
        if cache_dir:
            os.makedirs(cache_dir, exist_ok=True)
            cmd += ["--cache", cache_dir]

        # Threading
        cmd += ["--maxThreads", str(params.max_threads)]

        # Append all node-level overrides as --overrides JSON
        overrides = self._build_overrides(params)
        if overrides:
            overrides_json = json.dumps(overrides)
            cmd += ["--overrides", overrides_json]

        logger.debug(
            "Meshroom command: %s",
            " ".join(str(x) for x in cmd),
        )
        return cmd

    def build_preview_command(
        self,
        meshroom_path: str,
        input_path: str,
        preview_dir: str,
        params: MeshroomParameters,
    ) -> List[str]:
        """
        Builds a fast low-resolution preview command.

        Uses aggressive downscaling and reduced feature density for speed,
        targeting completion within 20% of the full reconstruction time.
        """
        preview_params = MeshroomParameters(
            preset="fast",
            feature_density="low",
            max_threads=max(2, params.max_threads // 2),
            downscale_factor=4,
            mesh_quality="medium",
            texture_resolution=2048,
            use_gpu=params.use_gpu,
        )
        return self.build_command(
            meshroom_path=meshroom_path,
            input_path=input_path,
            output_dir=preview_dir,
            params=preview_params,
        )

    def _build_overrides(self, params: MeshroomParameters) -> Dict[str, Any]:
        """
        Builds Meshroom --overrides dict for node-level parameter control.

        Meshroom supports overriding individual node attributes via JSON:
        {"NodeName_1": {"attr": value}, "NodeName_2": {"attr": value}}

        Returns:
            Dict mapping Meshroom node names to attribute overrides
        """
        overrides: Dict[str, Any] = {}
        preset = params.preset
        density = params.feature_density
        quality = params.mesh_quality

        # ------------------------------------------------------------------
        # FeatureExtraction node
        # ------------------------------------------------------------------
        descriptor_type = DESCRIPTOR_TYPES.get(preset, "sift_float")
        contrast_threshold = CONTRAST_THRESHOLDS.get(density, 0.01)
        max_features = MAX_FEATURES.get(density, 10_000)

        overrides["FeatureExtraction_1"] = {
            "describerTypes": [descriptor_type],
            "describerPreset": self._density_to_describer_preset(density),
            "contrastFiltering": "Static",
            "relativePeakThreshold": contrast_threshold,
            "gridFiltering": True,    # spread features evenly across image
            "maxNbFeatures": max_features,
            "downscale": params.downscale_factor,
            "forceCpuExtraction": not params.use_gpu,
        }

        # ------------------------------------------------------------------
        # FeatureMatching node
        # ------------------------------------------------------------------
        overrides["FeatureMatching_1"] = {
            "describerTypes": [descriptor_type],
            "maxMatches": max_features,
            "crossMatching": True,   # mutual nearest-neighbour — higher precision
            "guidedMatching": density in ("high", "ultra"),  # slower but accurate
        }

        # ------------------------------------------------------------------
        # DepthMap node (MVS dense matching — the #1 quality lever)
        # ------------------------------------------------------------------
        sgm_scale = DEPTH_SGM_SCALE.get(preset, 1)
        sgm_step = DEPTH_SGM_STEP.get(preset, 1)

        overrides["DepthMap_1"] = {
            "sgmScale": sgm_scale,
            "sgmStep": sgm_step,
            "refineEnabled": quality in ("high", "ultra"),  # sub-pixel refinement
            "refineHalfNbDepths": 5,
            "refineNSamplesHalf": 15 if quality == "ultra" else 10,
            "downscale": params.downscale_factor,
        }

        # ------------------------------------------------------------------
        # DepthMapFilter node — removes unreliable depth samples
        # ------------------------------------------------------------------
        thickness = DEPTH_FILTER_THICKNESS.get(preset, 1.0)
        min_views = DEPTH_FILTER_MIN_VIEWS.get(preset, 3)

        overrides["DepthMapFilter_1"] = {
            "minNumOfConsistentCams": min_views,
            "minNumOfConsistentCamsWithLowSimilarity": max(1, min_views - 1),
            "pixSizeBall": thickness,
            "pixSizeBallWithLowSimilarity": thickness * 2,
        }

        # ------------------------------------------------------------------
        # Meshing node — fuses depth maps into a dense mesh
        # ------------------------------------------------------------------
        overrides["Meshing_1"] = {
            "maxInputPoints": MESH_INPUT_POINTS.get(quality, 25_000_000),
            "maxPoints": MESH_OUTPUT_POINTS.get(quality, 1_000_000),
            "raysAddedPerIteration": 500 if quality == "ultra" else 300,
            "saveRawDensePointCloud": False,
            "estimateSpaceMinObservations": min_views,
            "minStep": 1,
        }

        # ------------------------------------------------------------------
        # MeshFiltering node — smoothing and denoising
        # ------------------------------------------------------------------
        filter_iters = MESH_FILTER_ITERATIONS.get(quality, 5)

        overrides["MeshFiltering_1"] = {
            "keepLargestMeshOnly": True,
            "smoothingIteration": filter_iters,
            "filterLargeTrianglesFactor": 60.0,  # remove outlier triangles
        }

        # ------------------------------------------------------------------
        # Texturing node
        # ------------------------------------------------------------------
        tex_res = TEXTURE_SIZES.get(params.texture_resolution, 4096)
        overrides["Texturing_1"] = {
            "textureSide": tex_res,
            "nbDiffuseSamples": 15 if quality == "ultra" else 10,
            "bestScoreThreshold": 0.0,
            "angleHardThreshold": 90.0,
            "forceVisibleByAllVertices": False,
            "fillHoles": True,          # fill texture seam holes
            "padding": 15,
        }

        return overrides

    @staticmethod
    def _density_to_describer_preset(density: str) -> str:
        """Maps our density setting to Meshroom describerPreset."""
        mapping = {
            "low": "normal",
            "medium": "normal",
            "high": "high",
            "ultra": "ultra",
        }
        return mapping.get(density, "high")

    def get_quality_summary(self, params: MeshroomParameters) -> Dict[str, Any]:
        """Returns a human-readable summary of the quality settings being applied."""
        return {
            "preset": params.preset,
            "descriptor_type": DESCRIPTOR_TYPES.get(params.preset, "sift_float"),
            "feature_density": params.feature_density,
            "max_features_per_image": MAX_FEATURES.get(params.feature_density, 10_000),
            "depth_sgm_scale": DEPTH_SGM_SCALE.get(params.preset, 1),
            "depth_refine_enabled": params.mesh_quality in ("high", "ultra"),
            "depth_min_consistent_views": DEPTH_FILTER_MIN_VIEWS.get(params.preset, 3),
            "mesh_max_input_points": MESH_INPUT_POINTS.get(params.mesh_quality, 25_000_000),
            "mesh_output_points": MESH_OUTPUT_POINTS.get(params.mesh_quality, 1_000_000),
            "mesh_smoothing_iterations": MESH_FILTER_ITERATIONS.get(params.mesh_quality, 5),
            "texture_resolution": params.texture_resolution,
            "use_gpu": params.use_gpu,
            "downscale": params.downscale_factor,
            "threads": params.max_threads,
        }
