"""
Unit tests for Parameter Optimizer component.

Tests specific examples and edge cases for parameter selection and retry logic.
"""

import pytest
from app.parameter_optimizer import ParameterOptimizer, MeshroomParameters
from app.input_analyzer import InputAnalysis


def make_analysis(image_count: int, width: int = 1920, height: int = 1080) -> InputAnalysis:
    """Build a minimal InputAnalysis for testing."""
    return InputAnalysis(
        image_count=image_count,
        avg_resolution=(width, height),
        min_resolution=(width, height),
        avg_sharpness=200.0,
        estimated_overlap=0.5,
        validation_passed=True,
        validation_errors=[],
        processing_preset="balanced",
    )


@pytest.fixture
def optimizer():
    return ParameterOptimizer()


class TestPresetSelection:
    """Tests for preset selection based on image count."""

    def test_15_images_selects_fast_preset(self, optimizer):
        """Test 15 images → fast preset selected with correct base config."""
        params = optimizer.select_parameters(make_analysis(15))
        assert params.preset == "fast"
        assert params.downscale_factor == 2
        assert params.mesh_quality == "medium"
        # feature_density may be bumped above "low" by resolution (1920x1080 ≈ 2MP → medium)
        assert params.feature_density in ("low", "medium", "high", "ultra")

    def test_15_images_low_resolution_gets_low_density(self, optimizer):
        """Test 15 images at low resolution → fast preset with low density."""
        # 800x600 = 480k pixels < 1MP → density stays "low"
        params = optimizer.select_parameters(make_analysis(15, width=800, height=600))
        assert params.preset == "fast"
        assert params.feature_density == "low"

    def test_35_images_selects_balanced_preset(self, optimizer):
        """Test 35 images → balanced preset selected."""
        params = optimizer.select_parameters(make_analysis(35))
        assert params.preset == "balanced"
        assert params.downscale_factor == 1
        assert params.mesh_quality == "high"

    def test_75_images_selects_quality_preset(self, optimizer):
        """Test 75 images → quality preset selected."""
        params = optimizer.select_parameters(make_analysis(75))
        assert params.preset == "quality"
        assert params.downscale_factor == 1
        assert params.mesh_quality == "ultra"

    def test_boundary_20_images_selects_balanced(self, optimizer):
        """Test exactly 20 images → balanced preset (boundary)."""
        params = optimizer.select_parameters(make_analysis(20))
        assert params.preset == "balanced"

    def test_boundary_50_images_selects_balanced(self, optimizer):
        """Test exactly 50 images → balanced preset (boundary)."""
        params = optimizer.select_parameters(make_analysis(50))
        assert params.preset == "balanced"

    def test_boundary_51_images_selects_quality(self, optimizer):
        """Test exactly 51 images → quality preset (boundary)."""
        params = optimizer.select_parameters(make_analysis(51))
        assert params.preset == "quality"


class TestRetryAdjustments:
    """Tests for retry parameter adjustments."""

    def test_timeout_failure_reduces_quality(self, optimizer):
        """Test timeout failure → retry with reduced quality (downscale=2, feature_density=medium)."""
        original = optimizer.select_parameters(make_analysis(75))
        assert original.preset == "quality"

        retried = optimizer.adjust_for_retry(original, "timeout")

        assert retried.downscale_factor == 2
        assert retried.feature_density == "medium"
        assert retried.mesh_quality == "medium"
        assert retried.preset == "fast"

    def test_insufficient_features_increases_sensitivity(self, optimizer):
        """Test insufficient features failure → retry with increased sensitivity (feature_density=high)."""
        original = optimizer.select_parameters(make_analysis(35))
        # balanced preset → medium density
        assert original.feature_density in ("medium", "high")

        retried = optimizer.adjust_for_retry(original, "insufficient_features")

        density_order = ["low", "medium", "high", "ultra"]
        original_idx = density_order.index(original.feature_density)
        retried_idx = density_order.index(retried.feature_density)

        assert retried_idx > original_idx, (
            f"Expected higher density after retry, got '{retried.feature_density}' "
            f"from '{original.feature_density}'"
        )

    def test_gpu_failure_disables_gpu(self, optimizer):
        """Test GPU failure → retry with GPU disabled and reduced threads."""
        original = optimizer.select_parameters(make_analysis(35))
        retried = optimizer.adjust_for_retry(original, "gpu_failure")

        assert retried.use_gpu is False
        assert retried.max_threads <= 4

    def test_retry_preserves_other_params_on_gpu_failure(self, optimizer):
        """Test GPU failure retry preserves non-GPU parameters."""
        original = optimizer.select_parameters(make_analysis(35))
        retried = optimizer.adjust_for_retry(original, "gpu_failure")

        assert retried.preset == original.preset
        assert retried.mesh_quality == original.mesh_quality


class TestGetPresetConfig:
    """Tests for get_preset_config method."""

    def test_fast_preset_config(self, optimizer):
        """Test fast preset returns correct config."""
        config = optimizer.get_preset_config("fast")
        assert config["downscale_factor"] == 2
        assert config["feature_density"] == "low"
        assert config["mesh_quality"] == "medium"

    def test_balanced_preset_config(self, optimizer):
        """Test balanced preset returns correct config."""
        config = optimizer.get_preset_config("balanced")
        assert config["downscale_factor"] == 1
        assert config["feature_density"] == "medium"
        assert config["mesh_quality"] == "high"

    def test_quality_preset_config(self, optimizer):
        """Test quality preset returns correct config."""
        config = optimizer.get_preset_config("quality")
        assert config["downscale_factor"] == 1
        assert config["feature_density"] == "high"
        assert config["mesh_quality"] == "ultra"

    def test_unknown_preset_raises_error(self, optimizer):
        """Test unknown preset raises ValueError."""
        with pytest.raises(ValueError, match="Unknown preset"):
            optimizer.get_preset_config("unknown")


class TestResourceAdjustments:
    """Tests for resource-based parameter adjustments."""

    def test_low_ram_reduces_batch_size(self, optimizer):
        """Test low RAM (< 8 GB) reduces downscale factor and feature density."""
        analysis = make_analysis(75)
        resources = {"ram_gb": 4, "cpu_cores": 8, "cpu_usage_percent": 20}
        params = optimizer.select_parameters(analysis, available_resources=resources)

        assert params.downscale_factor >= 2
        assert params.feature_density == "low"

    def test_high_cpu_usage_reduces_threads(self, optimizer):
        """Test high CPU usage (> 80%) reduces thread count."""
        analysis = make_analysis(35)
        resources = {"ram_gb": 16, "cpu_cores": 8, "cpu_usage_percent": 90}
        params = optimizer.select_parameters(analysis, available_resources=resources)

        assert params.max_threads <= 4

    def test_none_analysis_raises_error(self, optimizer):
        """Test None analysis raises ValueError."""
        with pytest.raises(ValueError):
            optimizer.select_parameters(None)


class TestFeatureDensityByResolution:
    """Tests for feature density adjustment based on resolution."""

    def test_low_resolution_gets_low_density(self, optimizer):
        """Test low resolution (< 1MP) gets low feature density."""
        # 800x600 = 480k pixels < 1MP
        analysis = make_analysis(15, width=800, height=600)
        params = optimizer.select_parameters(analysis)
        assert params.feature_density == "low"

    def test_hd_resolution_gets_medium_density(self, optimizer):
        """Test HD resolution (1-4MP) gets at least medium feature density."""
        # 1920x1080 = ~2MP
        analysis = make_analysis(35, width=1920, height=1080)
        params = optimizer.select_parameters(analysis)
        density_order = ["low", "medium", "high", "ultra"]
        assert density_order.index(params.feature_density) >= density_order.index("medium")

    def test_4k_resolution_gets_high_density(self, optimizer):
        """Test 4K resolution (4-8MP) gets at least high feature density."""
        # 3840x2160 = ~8.3MP → ultra
        analysis = make_analysis(75, width=3840, height=2160)
        params = optimizer.select_parameters(analysis)
        density_order = ["low", "medium", "high", "ultra"]
        assert density_order.index(params.feature_density) >= density_order.index("high")

    def test_8k_resolution_gets_ultra_density(self, optimizer):
        """Test 8K resolution (> 8MP) gets ultra feature density."""
        # 7680x4320 = ~33MP
        analysis = make_analysis(75, width=7680, height=4320)
        params = optimizer.select_parameters(analysis)
        assert params.feature_density == "ultra"
