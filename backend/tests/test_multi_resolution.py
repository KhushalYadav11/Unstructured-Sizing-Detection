"""
Unit tests for Multi-Resolution Processing.

Tests specific examples and edge cases for preview and full model generation.
"""

import os
import tempfile
import pytest

from app.multi_resolution import (
    MultiResolutionProcessor,
    PREVIEW_DOWNSCALE_FACTOR,
    PREVIEW_TIME_FRACTION,
)


@pytest.fixture
def tmpdir():
    with tempfile.TemporaryDirectory() as d:
        yield d


@pytest.fixture
def processor(tmpdir):
    return MultiResolutionProcessor(job_id=1, output_dir=tmpdir)


class TestPreviewTimeLimit:
    """Tests for estimate_preview_time_limit method."""

    def test_preview_limit_is_20_percent_of_full_time(self, processor):
        """Test preview time limit is 20% of estimated full time."""
        limit = processor.estimate_preview_time_limit(1000.0)
        assert abs(limit - 200.0) < 0.001

    def test_preview_limit_for_1800_seconds(self, processor):
        """Test preview limit for 1800s full time → 360s."""
        limit = processor.estimate_preview_time_limit(1800.0)
        assert abs(limit - 360.0) < 0.001


class TestPreviewStatus:
    """Tests for get_preview_status method."""

    def test_no_preview_mesh_returns_not_ready(self, processor):
        """Test no preview mesh → preview_ready=False."""
        status = processor.get_preview_status()
        assert status["preview_ready"] is False
        assert status["preview_model_path"] is None

    def test_preview_mesh_exists_returns_ready(self, processor):
        """Test preview mesh exists → preview_ready=True with path."""
        # Create a dummy preview mesh
        mesh_path = os.path.join(processor.preview_dir, "mesh.obj")
        with open(mesh_path, "w") as f:
            f.write("# OBJ\n")

        status = processor.get_preview_status()
        assert status["preview_ready"] is True
        assert status["preview_model_path"] == mesh_path


class TestBuildCommands:
    """Tests for build_preview_command and build_full_command methods."""

    def test_preview_command_uses_downscale_4(self, processor):
        """Test preview command uses downscale=4."""
        cmd = processor.build_preview_command(
            meshroom_path="/usr/bin/meshroom_batch",
            input_path="/input",
            base_params={"max_threads": 8},
        )
        assert "--downscale" in cmd
        idx = cmd.index("--downscale")
        assert cmd[idx + 1] == str(PREVIEW_DOWNSCALE_FACTOR)

    def test_preview_command_includes_output_dir(self, processor):
        """Test preview command includes preview output directory."""
        cmd = processor.build_preview_command(
            meshroom_path="/usr/bin/meshroom_batch",
            input_path="/input",
            base_params={},
        )
        assert "--output" in cmd
        idx = cmd.index("--output")
        assert processor.preview_dir in cmd[idx + 1]

    def test_full_command_uses_params_downscale(self, processor):
        """Test full command uses downscale from params."""
        params = {"downscale_factor": 1, "max_threads": 16}
        cmd = processor.build_full_command(
            meshroom_path="/usr/bin/meshroom_batch",
            input_path="/input",
            params=params,
        )
        assert "--downscale" in cmd
        idx = cmd.index("--downscale")
        assert cmd[idx + 1] == "1"

    def test_full_command_includes_full_output_dir(self, processor):
        """Test full command includes full output directory."""
        cmd = processor.build_full_command(
            meshroom_path="/usr/bin/meshroom_batch",
            input_path="/input",
            params={"downscale_factor": 1},
        )
        assert "--output" in cmd
        idx = cmd.index("--output")
        assert processor.full_dir in cmd[idx + 1]


class TestFindOutputMesh:
    """Tests for find_output_mesh method."""

    def test_finds_obj_file_in_directory(self, processor, tmpdir):
        """Test finds .obj file in directory."""
        mesh_path = os.path.join(tmpdir, "mesh.obj")
        with open(mesh_path, "w") as f:
            f.write("# OBJ\n")

        found = processor.find_output_mesh(tmpdir)
        assert found == mesh_path

    def test_returns_none_when_no_obj_file(self, processor, tmpdir):
        """Test returns None when no .obj file exists."""
        found = processor.find_output_mesh(tmpdir)
        assert found is None

    def test_finds_obj_in_subdirectory(self, processor, tmpdir):
        """Test finds .obj file in subdirectory."""
        subdir = os.path.join(tmpdir, "MeshroomCache", "Texturing")
        os.makedirs(subdir)
        mesh_path = os.path.join(subdir, "texturedMesh.obj")
        with open(mesh_path, "w") as f:
            f.write("# OBJ\n")

        found = processor.find_output_mesh(tmpdir)
        assert found == mesh_path


class TestDirectoryCreation:
    """Tests for directory setup."""

    def test_preview_and_full_dirs_created(self, tmpdir):
        """Test preview and full directories are created on init."""
        processor = MultiResolutionProcessor(job_id=1, output_dir=tmpdir)
        assert os.path.isdir(processor.preview_dir)
        assert os.path.isdir(processor.full_dir)
