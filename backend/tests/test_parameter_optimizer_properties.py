"""
Property-Based Tests for Parameter Optimizer component.

Tests universal correctness properties across all valid inputs using Hypothesis.
"""

import time
import pytest
from dataclasses import dataclass
from hypothesis import given, strategies as st, settings, assume

from app.parameter_optimizer import ParameterOptimizer, MeshroomParameters
from app.input_analyzer import InputAnalysis


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Property 2: Adaptive Parameter Selection by Image Count
# ---------------------------------------------------------------------------

class TestProperty2PresetSelection:
    """
    Property 2: Adaptive Parameter Selection by Image Count
    Validates: Requirements 2.2, 2.3, 2.4, 2.5
    """

    @given(image_count=st.integers(min_value=1, max_value=19))
    @settings(max_examples=50, deadline=None)
    def test_fast_preset_for_fewer_than_20_images(self, image_count):
        """For any input with < 20 images, fast preset SHALL be selected."""
        optimizer = ParameterOptimizer()
        analysis = make_analysis(image_count)

        start = time.time()
        params = optimizer.select_parameters(analysis)
        elapsed = time.time() - start

        assert params.preset == "fast", (
            f"Expected 'fast' preset for {image_count} images, got '{params.preset}'"
        )
        assert elapsed <= 5.0, (
            f"Parameter selection took {elapsed:.2f}s, exceeding 5s limit"
        )

    @given(image_count=st.integers(min_value=20, max_value=50))
    @settings(max_examples=50, deadline=None)
    def test_balanced_preset_for_20_to_50_images(self, image_count):
        """For any input with 20-50 images, balanced preset SHALL be selected."""
        optimizer = ParameterOptimizer()
        analysis = make_analysis(image_count)

        start = time.time()
        params = optimizer.select_parameters(analysis)
        elapsed = time.time() - start

        assert params.preset == "balanced", (
            f"Expected 'balanced' preset for {image_count} images, got '{params.preset}'"
        )
        assert elapsed <= 5.0

    @given(image_count=st.integers(min_value=51, max_value=200))
    @settings(max_examples=50, deadline=None)
    def test_quality_preset_for_more_than_50_images(self, image_count):
        """For any input with > 50 images, quality preset SHALL be selected."""
        optimizer = ParameterOptimizer()
        analysis = make_analysis(image_count)

        start = time.time()
        params = optimizer.select_parameters(analysis)
        elapsed = time.time() - start

        assert params.preset == "quality", (
            f"Expected 'quality' preset for {image_count} images, got '{params.preset}'"
        )
        assert elapsed <= 5.0

    @given(image_count=st.integers(min_value=1, max_value=200))
    @settings(max_examples=100, deadline=None)
    def test_preset_selection_always_valid(self, image_count):
        """For any image count, selected preset SHALL be one of the valid presets."""
        optimizer = ParameterOptimizer()
        analysis = make_analysis(image_count)

        params = optimizer.select_parameters(analysis)

        assert params.preset in ("fast", "balanced", "quality"), (
            f"Invalid preset '{params.preset}' for image_count={image_count}"
        )
        assert params.downscale_factor >= 1
        assert params.max_threads >= 1
        assert params.texture_resolution > 0
        assert params.feature_density in ("low", "medium", "high", "ultra")
        assert params.mesh_quality in ("medium", "high", "ultra")


# ---------------------------------------------------------------------------
# Property 3: Feature Density Adjustment by Resolution
# ---------------------------------------------------------------------------

class TestProperty3FeatureDensity:
    """
    Property 3: Feature Density Adjustment by Resolution
    Validates: Requirements 2.1, 2.6
    """

    DENSITY_ORDER = ["low", "medium", "high", "ultra"]

    @given(
        width=st.integers(min_value=640, max_value=7680),
        height=st.integers(min_value=480, max_value=4320),
    )
    @settings(max_examples=100, deadline=None)
    def test_feature_density_increases_with_resolution(self, width, height):
        """
        For any image resolution, feature density SHALL increase proportionally.
        Higher resolution → higher or equal density setting.
        """
        optimizer = ParameterOptimizer()

        # Use balanced preset (20 images) as baseline
        analysis = make_analysis(35, width, height)
        params = optimizer.select_parameters(analysis)

        # Density must be a valid value
        assert params.feature_density in self.DENSITY_ORDER, (
            f"Invalid feature_density '{params.feature_density}' for {width}x{height}"
        )

        pixel_count = width * height

        # Verify density is proportional to resolution
        if pixel_count >= 8_000_000:
            assert params.feature_density == "ultra", (
                f"Expected 'ultra' density for {width}x{height} ({pixel_count} px), "
                f"got '{params.feature_density}'"
            )
        elif pixel_count >= 4_000_000:
            assert params.feature_density in ("high", "ultra"), (
                f"Expected 'high' or 'ultra' density for {width}x{height} ({pixel_count} px), "
                f"got '{params.feature_density}'"
            )
        elif pixel_count >= 1_000_000:
            assert params.feature_density in ("medium", "high", "ultra"), (
                f"Expected at least 'medium' density for {width}x{height} ({pixel_count} px), "
                f"got '{params.feature_density}'"
            )

    @given(
        low_width=st.integers(min_value=640, max_value=1279),
        low_height=st.integers(min_value=480, max_value=719),
        high_width=st.integers(min_value=3840, max_value=7680),
        high_height=st.integers(min_value=2160, max_value=4320),
    )
    @settings(max_examples=50, deadline=None)
    def test_higher_resolution_gets_higher_or_equal_density(
        self, low_width, low_height, high_width, high_height
    ):
        """
        For any two resolutions where one is clearly higher, the higher resolution
        SHALL receive a higher or equal feature density.
        """
        optimizer = ParameterOptimizer()

        low_res_analysis = make_analysis(35, low_width, low_height)
        high_res_analysis = make_analysis(35, high_width, high_height)

        low_params = optimizer.select_parameters(low_res_analysis)
        high_params = optimizer.select_parameters(high_res_analysis)

        low_idx = self.DENSITY_ORDER.index(low_params.feature_density)
        high_idx = self.DENSITY_ORDER.index(high_params.feature_density)

        assert high_idx >= low_idx, (
            f"Higher resolution ({high_width}x{high_height}) should get >= density "
            f"than lower resolution ({low_width}x{low_height}), "
            f"but got '{high_params.feature_density}' vs '{low_params.feature_density}'"
        )
