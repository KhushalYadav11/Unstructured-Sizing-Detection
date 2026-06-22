"""
Property-Based Tests for Quality Validator component.

Tests universal correctness properties across all valid inputs using Hypothesis.
"""

import pytest
from hypothesis import given, strategies as st, settings

from app.quality_validator import QualityValidator, QualityMetrics, LOW_QUALITY_THRESHOLD


def make_metrics(
    is_watertight: bool = True,
    watertightness_percent: float = 100.0,
    hole_count: int = 0,
    camera_poses_reconstructed: int = 30,
    camera_poses_total: int = 35,
    texture_coverage_percent: float = 80.0,
    vertex_count: int = 10000,
    face_count: int = 20000,
) -> QualityMetrics:
    return QualityMetrics(
        is_watertight=is_watertight,
        watertightness_percent=watertightness_percent,
        hole_count=hole_count,
        camera_poses_reconstructed=camera_poses_reconstructed,
        camera_poses_total=camera_poses_total,
        texture_coverage_percent=texture_coverage_percent,
        vertex_count=vertex_count,
        face_count=face_count,
    )


# ---------------------------------------------------------------------------
# Property 6: Quality Score Calculation Range
# ---------------------------------------------------------------------------

class TestProperty6QualityScoreRange:
    """
    Property 6: Quality Score Calculation Range
    Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
    """

    @given(
        is_watertight=st.booleans(),
        watertightness_percent=st.floats(min_value=0.0, max_value=100.0),
        hole_count=st.integers(min_value=0, max_value=20),
        camera_poses_reconstructed=st.integers(min_value=0, max_value=100),
        camera_poses_total=st.integers(min_value=1, max_value=100),
        texture_coverage_percent=st.floats(min_value=0.0, max_value=100.0),
    )
    @settings(max_examples=200, deadline=None)
    def test_quality_score_always_between_0_and_100(
        self,
        is_watertight,
        watertightness_percent,
        hole_count,
        camera_poses_reconstructed,
        camera_poses_total,
        texture_coverage_percent,
    ):
        """
        For any mesh characteristics, quality score SHALL always be between 0 and 100.
        Validates: Requirements 5.4
        """
        # Ensure reconstructed <= total
        camera_poses_reconstructed = min(camera_poses_reconstructed, camera_poses_total)

        validator = QualityValidator()
        metrics = make_metrics(
            is_watertight=is_watertight,
            watertightness_percent=watertightness_percent,
            hole_count=hole_count,
            camera_poses_reconstructed=camera_poses_reconstructed,
            camera_poses_total=camera_poses_total,
            texture_coverage_percent=texture_coverage_percent,
        )

        score = validator.calculate_quality_score(metrics)

        assert 0 <= score <= 100, (
            f"Quality score {score} out of range [0, 100] for metrics: "
            f"watertight={is_watertight}, holes={hole_count}, "
            f"poses={camera_poses_reconstructed}/{camera_poses_total}, "
            f"texture={texture_coverage_percent:.1f}%"
        )

    @given(
        hole_count=st.integers(min_value=5, max_value=20),
        camera_poses_reconstructed=st.integers(min_value=0, max_value=10),
        camera_poses_total=st.integers(min_value=20, max_value=50),
        texture_coverage_percent=st.floats(min_value=0.0, max_value=30.0),
    )
    @settings(max_examples=100, deadline=None)
    def test_low_quality_mesh_flagged(
        self,
        hole_count,
        camera_poses_reconstructed,
        camera_poses_total,
        texture_coverage_percent,
    ):
        """
        Meshes with many holes, few reconstructed poses, and low texture coverage
        SHALL be flagged as low quality (score < 50).
        Validates: Requirement 5.5
        """
        validator = QualityValidator()
        metrics = make_metrics(
            is_watertight=False,
            watertightness_percent=10.0,
            hole_count=hole_count,
            camera_poses_reconstructed=camera_poses_reconstructed,
            camera_poses_total=camera_poses_total,
            texture_coverage_percent=texture_coverage_percent,
        )

        score = validator.calculate_quality_score(metrics)

        # With many holes (>=5), low reconstruction, and low texture, score should be < 50
        if hole_count >= 5 and camera_poses_reconstructed <= 5 and texture_coverage_percent <= 20.0:
            assert validator.should_flag_low_quality(score), (
                f"Expected low quality flag for score={score} "
                f"(holes={hole_count}, poses={camera_poses_reconstructed}/{camera_poses_total}, "
                f"texture={texture_coverage_percent:.1f}%)"
            )

    @given(
        camera_poses_reconstructed=st.integers(min_value=0, max_value=100),
        camera_poses_total=st.integers(min_value=1, max_value=100),
    )
    @settings(max_examples=100, deadline=None)
    def test_score_increases_with_more_reconstructed_poses(
        self, camera_poses_reconstructed, camera_poses_total
    ):
        """
        Higher ratio of reconstructed poses SHALL result in higher or equal quality score.
        Validates: Requirement 5.1
        """
        camera_poses_reconstructed = min(camera_poses_reconstructed, camera_poses_total)

        validator = QualityValidator()

        # Perfect reconstruction
        perfect_metrics = make_metrics(
            camera_poses_reconstructed=camera_poses_total,
            camera_poses_total=camera_poses_total,
            is_watertight=True,
            hole_count=0,
            texture_coverage_percent=100.0,
        )

        # Partial reconstruction
        partial_metrics = make_metrics(
            camera_poses_reconstructed=camera_poses_reconstructed,
            camera_poses_total=camera_poses_total,
            is_watertight=True,
            hole_count=0,
            texture_coverage_percent=100.0,
        )

        perfect_score = validator.calculate_quality_score(perfect_metrics)
        partial_score = validator.calculate_quality_score(partial_metrics)

        assert perfect_score >= partial_score, (
            f"Perfect reconstruction ({camera_poses_total}/{camera_poses_total}) "
            f"should score >= partial ({camera_poses_reconstructed}/{camera_poses_total}): "
            f"{perfect_score} vs {partial_score}"
        )

    @given(
        hole_count_low=st.integers(min_value=0, max_value=2),
        hole_count_high=st.integers(min_value=5, max_value=10),
    )
    @settings(max_examples=50, deadline=None)
    def test_fewer_holes_gives_higher_score(self, hole_count_low, hole_count_high):
        """
        Fewer holes SHALL result in a higher or equal quality score.
        Validates: Requirement 5.3
        """
        validator = QualityValidator()

        low_holes = make_metrics(hole_count=hole_count_low, is_watertight=(hole_count_low == 0))
        high_holes = make_metrics(hole_count=hole_count_high, is_watertight=False)

        score_low = validator.calculate_quality_score(low_holes)
        score_high = validator.calculate_quality_score(high_holes)

        assert score_low >= score_high, (
            f"Fewer holes ({hole_count_low}) should score >= more holes ({hole_count_high}): "
            f"{score_low} vs {score_high}"
        )


# ---------------------------------------------------------------------------
# Property 19: Quality Metrics Reporting
# ---------------------------------------------------------------------------

class TestProperty19QualityMetricsReporting:
    """
    Property 19: Quality Metrics Reporting
    Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
    """

    @given(
        vertex_count=st.integers(min_value=100, max_value=1_000_000),
        face_count=st.integers(min_value=100, max_value=2_000_000),
        hole_count=st.integers(min_value=0, max_value=10),
        camera_poses_reconstructed=st.integers(min_value=0, max_value=50),
        camera_poses_total=st.integers(min_value=1, max_value=50),
        texture_coverage=st.floats(min_value=0.0, max_value=100.0),
    )
    @settings(max_examples=100, deadline=None)
    def test_all_metrics_have_valid_types_and_ranges(
        self,
        vertex_count,
        face_count,
        hole_count,
        camera_poses_reconstructed,
        camera_poses_total,
        texture_coverage,
    ):
        """
        For any reconstruction result, all quality metrics SHALL be calculated
        and have valid types and ranges.
        Validates: Requirements 13.1-13.6
        """
        camera_poses_reconstructed = min(camera_poses_reconstructed, camera_poses_total)

        validator = QualityValidator()
        metrics = QualityMetrics(
            vertex_count=vertex_count,
            face_count=face_count,
            hole_count=hole_count,
            camera_poses_reconstructed=camera_poses_reconstructed,
            camera_poses_total=camera_poses_total,
            texture_coverage_percent=texture_coverage,
            is_watertight=(hole_count == 0),
            watertightness_percent=100.0 if hole_count == 0 else max(0.0, 100.0 - hole_count * 10),
            surface_area=float(face_count * 0.01),
            reprojection_error_mean=0.5,
            reprojection_error_std=0.1,
            point_cloud_density=float(vertex_count * 0.1),
            texture_resolution=(4096, 4096),
        )

        score = validator.calculate_quality_score(metrics)

        # All metrics must be valid
        assert isinstance(metrics.vertex_count, int) and metrics.vertex_count >= 0
        assert isinstance(metrics.face_count, int) and metrics.face_count >= 0
        assert isinstance(metrics.hole_count, int) and metrics.hole_count >= 0
        assert isinstance(metrics.surface_area, float) and metrics.surface_area >= 0
        assert 0 <= metrics.camera_poses_reconstructed <= metrics.camera_poses_total
        assert 0.0 <= metrics.texture_coverage_percent <= 100.0
        assert 0 <= score <= 100

    def test_should_flag_low_quality_below_50(self):
        """Scores below 50 SHALL be flagged as low quality."""
        validator = QualityValidator()
        for score in range(0, 50):
            assert validator.should_flag_low_quality(score), (
                f"Expected score {score} to be flagged as low quality"
            )

    def test_should_not_flag_quality_at_50_or_above(self):
        """Scores at 50 or above SHALL NOT be flagged as low quality."""
        validator = QualityValidator()
        for score in range(50, 101):
            assert not validator.should_flag_low_quality(score), (
                f"Expected score {score} NOT to be flagged as low quality"
            )
