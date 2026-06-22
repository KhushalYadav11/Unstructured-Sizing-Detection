"""
Parameter Optimizer Component for Meshroom Performance Optimization

Selects optimal Meshroom parameters based on input characteristics and failure history.
"""

import time
from dataclasses import dataclass, field
from typing import Optional, Dict, Any

from app.input_analyzer import InputAnalysis
from app.config import settings


@dataclass
class MeshroomParameters:
    """Optimal Meshroom processing parameters."""
    preset: str                  # "fast", "balanced", "quality"
    feature_density: str         # "low", "medium", "high", "ultra"
    max_threads: int
    downscale_factor: int
    mesh_quality: str            # "medium", "high", "ultra"
    texture_resolution: int
    use_gpu: bool = True


class ParameterOptimizer:
    """Selects optimal Meshroom parameters based on input characteristics."""

    # Preset configurations: (downscale, feature_density, mesh_quality, texture_resolution)
    PRESET_CONFIGS: Dict[str, Dict[str, Any]] = {
        "fast": {
            "downscale_factor": 2,
            "feature_density": "low",
            "mesh_quality": "medium",
            "texture_resolution": 2048,
            "max_threads": 4,
        },
        "balanced": {
            "downscale_factor": 1,
            "feature_density": "medium",
            "mesh_quality": "high",
            "texture_resolution": 4096,
            "max_threads": 8,
        },
        "quality": {
            "downscale_factor": 1,
            "feature_density": "high",
            "mesh_quality": "ultra",
            "texture_resolution": 8192,
            "max_threads": 16,
        },
    }

    # Feature density ordering for comparison
    DENSITY_ORDER = ["low", "medium", "high", "ultra"]

    def select_parameters(
        self,
        analysis: InputAnalysis,
        available_resources: Optional[Dict[str, Any]] = None,
        retry_context: Optional[Dict[str, Any]] = None,
    ) -> MeshroomParameters:
        """
        Selects optimal parameters based on input analysis and available resources.

        Args:
            analysis: InputAnalysis result from Input_Analyzer
            available_resources: Dict with keys cpu_cores, ram_gb, gpu_memory_mb
            retry_context: Dict with failure_type from a previous attempt

        Returns:
            MeshroomParameters with selected configuration

        Raises:
            ValueError: If analysis is None
        """
        if analysis is None:
            raise ValueError("InputAnalysis must not be None")

        start_time = time.time()

        # Select preset based on image count
        preset = self._select_preset(analysis.image_count)
        config = dict(self.PRESET_CONFIGS[preset])

        # Adjust feature density based on resolution
        config["feature_density"] = self._adjust_feature_density(
            analysis.avg_resolution, preset
        )

        # Adjust for available resources
        if available_resources:
            config = self._adjust_for_resources(config, available_resources)

        # Apply retry adjustments if this is a retry attempt
        if retry_context and retry_context.get("failure_type"):
            config = self._apply_retry_adjustments(config, retry_context["failure_type"])

        params = MeshroomParameters(
            preset=preset,
            feature_density=config["feature_density"],
            max_threads=config["max_threads"],
            downscale_factor=config["downscale_factor"],
            mesh_quality=config["mesh_quality"],
            texture_resolution=config["texture_resolution"],
            use_gpu=settings.GPU_ENABLED,
        )

        elapsed = time.time() - start_time
        if elapsed > 5.0:
            import logging
            logging.getLogger(__name__).warning(
                f"Parameter selection took {elapsed:.2f}s, exceeding 5s limit"
            )

        return params

    def adjust_for_retry(
        self,
        params: MeshroomParameters,
        failure_type: str,
    ) -> MeshroomParameters:
        """
        Adjusts parameters based on previous failure type.

        Args:
            params: Current MeshroomParameters
            failure_type: One of "timeout", "insufficient_features", "gpu_failure"

        Returns:
            New MeshroomParameters adjusted for retry
        """
        config = {
            "preset": params.preset,
            "feature_density": params.feature_density,
            "max_threads": params.max_threads,
            "downscale_factor": params.downscale_factor,
            "mesh_quality": params.mesh_quality,
            "texture_resolution": params.texture_resolution,
        }

        config = self._apply_retry_adjustments(config, failure_type)

        use_gpu = params.use_gpu
        if failure_type == "gpu_failure":
            use_gpu = False

        return MeshroomParameters(
            preset=config["preset"],
            feature_density=config["feature_density"],
            max_threads=config["max_threads"],
            downscale_factor=config["downscale_factor"],
            mesh_quality=config["mesh_quality"],
            texture_resolution=config["texture_resolution"],
            use_gpu=use_gpu,
        )

    def get_preset_config(self, preset: str) -> Dict[str, Any]:
        """
        Returns Meshroom CLI arguments for a given preset.

        Args:
            preset: One of "fast", "balanced", "quality"

        Returns:
            Dict of Meshroom CLI arguments

        Raises:
            ValueError: If preset is unknown
        """
        if preset not in self.PRESET_CONFIGS:
            raise ValueError(
                f"Unknown preset '{preset}'. Valid presets: {list(self.PRESET_CONFIGS.keys())}"
            )
        return dict(self.PRESET_CONFIGS[preset])

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _select_preset(self, image_count: int) -> str:
        """Select preset based on image count."""
        if image_count < 20:
            return "fast"
        elif image_count <= 50:
            return "balanced"
        else:
            return "quality"

    def _adjust_feature_density(
        self, avg_resolution: tuple, base_preset: str
    ) -> str:
        """
        Adjust feature density proportionally to image resolution.

        Higher resolution → higher density setting.
        """
        width, height = avg_resolution
        pixel_count = width * height

        # Thresholds (pixels)
        # < 1MP  → low
        # 1-4MP  → medium
        # 4-8MP  → high
        # > 8MP  → ultra
        if pixel_count < 1_000_000:
            density = "low"
        elif pixel_count < 4_000_000:
            density = "medium"
        elif pixel_count < 8_000_000:
            density = "high"
        else:
            density = "ultra"

        # Never go below the preset's base density
        base_density = self.PRESET_CONFIGS[base_preset]["feature_density"]
        if self.DENSITY_ORDER.index(density) < self.DENSITY_ORDER.index(base_density):
            density = base_density

        return density

    def _adjust_for_resources(
        self, config: Dict[str, Any], resources: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Adjust parameters based on available system resources."""
        config = dict(config)

        ram_gb = resources.get("ram_gb", 16)
        cpu_cores = resources.get("cpu_cores", 8)
        cpu_usage_percent = resources.get("cpu_usage_percent", 0)

        # Reduce batch sizes if RAM is low
        if ram_gb < 8:
            config["downscale_factor"] = max(config["downscale_factor"], 2)
            config["feature_density"] = "low"

        # Reduce thread count if CPU is heavily loaded
        if cpu_usage_percent > 80:
            config["max_threads"] = max(2, cpu_cores // 2)
        else:
            config["max_threads"] = min(config["max_threads"], cpu_cores)

        return config

    def _apply_retry_adjustments(
        self, config: Dict[str, Any], failure_type: str
    ) -> Dict[str, Any]:
        """Apply parameter adjustments based on failure type."""
        config = dict(config)

        if failure_type == "timeout":
            # Reduce quality for faster processing
            config["downscale_factor"] = 2
            config["feature_density"] = "medium"
            config["mesh_quality"] = "medium"
            config["texture_resolution"] = 2048
            config["preset"] = "fast"

        elif failure_type == "insufficient_features":
            # Increase feature extraction sensitivity
            current_idx = self.DENSITY_ORDER.index(config["feature_density"])
            if current_idx < len(self.DENSITY_ORDER) - 1:
                config["feature_density"] = self.DENSITY_ORDER[current_idx + 1]

        elif failure_type == "gpu_failure":
            # Disable GPU, reduce threads to avoid overload
            config["max_threads"] = min(config["max_threads"], 4)

        return config
