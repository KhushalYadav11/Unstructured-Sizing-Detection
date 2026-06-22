"""
Property-Based Tests for Multi-Resolution Processing.

Tests universal correctness properties across all valid inputs using Hypothesis.
"""

import os
import tempfile
from hypothesis import given, strategies as st, settings

from app.multi_resolution import MultiResolutionProcessor, PREVIEW_TIME_FRACTION


# ---------------------------------------------------------------------------
# Property 12: Multi-Resolution Processing Workflow
# ---------------------------------------------------------------------------

class TestProperty12MultiResolutionWorkflow:
    """
    Property 12: Multi-Resolution Processing Workflow
    Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
    """

    @given(
        estimated_full_time=st.floats(min_value=60.0, max_value=7200.0),
    )
    @settings(max_examples=100, deadline=None)
    def test_preview_time_limit_is_20_percent_of_full_time(self, estimated_full_time):
        """
        Preview model SHALL complete within 20% of estimated full processing time.
        Validates: Requirement 8.2
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            processor = MultiResolutionProcessor(job_id=1, output_dir=tmpdir)
            limit = processor.estimate_preview_time_limit(estimated_full_time)

            expected = estimated_full_time * PREVIEW_TIME_FRACTION
            assert abs(limit - expected) < 0.001, (
                f"Expected preview limit {expected:.2f}s, got {limit:.2f}s"
            )
            assert limit < estimated_full_time, (
                "Preview time limit should be less than full processing time"
            )

    @given(
        estimated_full_time=st.floats(min_value=60.0, max_value=7200.0),
    )
    @settings(max_examples=50, deadline=None)
    def test_preview_time_limit_always_positive(self, estimated_full_time):
        """
        Preview time limit SHALL always be positive.
        Validates: Requirement 8.2
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            processor = MultiResolutionProcessor(job_id=1, output_dir=tmpdir)
            limit = processor.estimate_preview_time_limit(estimated_full_time)
            assert limit > 0

    def test_preview_status_no_mesh_returns_not_ready(self):
        """
        When no preview mesh exists, preview_ready SHALL be False.
        Validates: Requirement 8.3
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            processor = MultiResolutionProcessor(job_id=1, output_dir=tmpdir)
            status = processor.get_preview_status()

            assert status["preview_ready"] is False
            assert status["preview_model_path"] is None

    def test_preview_status_with_mesh_returns_ready(self):
        """
        When preview mesh exists, preview_ready SHALL be True with path.
        Validates: Requirement 8.3
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            processor = MultiResolutionProcessor(job_id=1, output_dir=tmpdir)

            # Create a dummy preview mesh
            preview_mesh = os.path.join(processor.preview_dir, "mesh.obj")
            with open(preview_mesh, "w") as f:
                f.write("# OBJ file\n")

            status = processor.get_preview_status()

            assert status["preview_ready"] is True
            assert status["preview_model_path"] == preview_mesh

    @given(
        downscale=st.integers(min_value=1, max_value=8),
        max_threads=st.integers(min_value=1, max_value=32),
    )
    @settings(max_examples=50, deadline=None)
    def test_preview_command_uses_downscale_4(self, downscale, max_threads):
        """
        Preview command SHALL use downscale factor of 4 for fast processing.
        Validates: Requirement 8.1
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            processor = MultiResolutionProcessor(job_id=1, output_dir=tmpdir)
            params = {"downscale_factor": downscale, "max_threads": max_threads}

            cmd = processor.build_preview_command(
                meshroom_path="/usr/bin/meshroom_batch",
                input_path="/input",
                base_params=params,
            )

            # Preview should always use downscale=4
            assert "--downscale" in cmd
            downscale_idx = cmd.index("--downscale")
            assert cmd[downscale_idx + 1] == "4", (
                f"Expected preview downscale=4, got {cmd[downscale_idx + 1]}"
            )
