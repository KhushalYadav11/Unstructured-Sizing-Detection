"""
Multi-Resolution Processing for Meshroom Performance Optimization

Generates a low-resolution preview model before the full-resolution model,
providing faster feedback to users.
"""

import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# Preview downscale factor (4x = much faster processing)
PREVIEW_DOWNSCALE_FACTOR = 4

# Preview must complete within this fraction of estimated full processing time
PREVIEW_TIME_FRACTION = 0.20


@dataclass
class MultiResolutionResult:
    """Result of multi-resolution processing."""
    preview_model_path: Optional[str]
    preview_ready_at: Optional[datetime]
    full_model_path: Optional[str]
    preview_processing_time_seconds: float
    full_processing_time_seconds: float
    preview_completed: bool
    full_completed: bool


class MultiResolutionProcessor:
    """
    Manages multi-resolution Meshroom processing.

    Generates a low-resolution preview first, then continues with full resolution.
    """

    def __init__(self, job_id: int, output_dir: str):
        self.job_id = job_id
        self.output_dir = output_dir
        self.preview_dir = os.path.join(output_dir, "preview")
        self.full_dir = os.path.join(output_dir, "full")
        os.makedirs(self.preview_dir, exist_ok=True)
        os.makedirs(self.full_dir, exist_ok=True)

    def build_preview_command(
        self,
        meshroom_path: str,
        input_path: str,
        base_params: dict,
    ) -> list:
        """
        Builds Meshroom CLI command for low-resolution preview generation.

        Args:
            meshroom_path: Path to meshroom_batch executable
            input_path: Path to input images
            base_params: Base Meshroom parameters dict

        Returns:
            List of command arguments
        """
        cmd = [
            meshroom_path,
            "--input", input_path,
            "--output", self.preview_dir,
            "--downscale", str(PREVIEW_DOWNSCALE_FACTOR),
        ]

        # Override quality settings for speed
        if base_params.get("max_threads"):
            cmd += ["--maxThreads", str(base_params["max_threads"])]

        return cmd

    def build_full_command(
        self,
        meshroom_path: str,
        input_path: str,
        params: dict,
    ) -> list:
        """
        Builds Meshroom CLI command for full-resolution processing.

        Args:
            meshroom_path: Path to meshroom_batch executable
            input_path: Path to input images
            params: Full Meshroom parameters dict

        Returns:
            List of command arguments
        """
        cmd = [
            meshroom_path,
            "--input", input_path,
            "--output", self.full_dir,
            "--downscale", str(params.get("downscale_factor", 1)),
        ]

        if params.get("max_threads"):
            cmd += ["--maxThreads", str(params["max_threads"])]

        return cmd

    def find_output_mesh(self, search_dir: str) -> Optional[str]:
        """
        Finds the output .obj mesh file in a directory.

        Args:
            search_dir: Directory to search

        Returns:
            Path to .obj file, or None if not found
        """
        for root, _, files in os.walk(search_dir):
            for fname in files:
                if fname.endswith(".obj"):
                    return os.path.join(root, fname)
        return None

    def estimate_preview_time_limit(self, estimated_full_time_seconds: float) -> float:
        """
        Returns the maximum allowed time for preview generation.

        Preview must complete within 20% of estimated full processing time.

        Args:
            estimated_full_time_seconds: Estimated full processing time

        Returns:
            Maximum preview time in seconds
        """
        return estimated_full_time_seconds * PREVIEW_TIME_FRACTION

    def get_preview_status(self) -> dict:
        """
        Returns current preview status.

        Returns:
            Dict with preview_ready (bool) and preview_model_path (str or None)
        """
        preview_mesh = self.find_output_mesh(self.preview_dir)
        return {
            "preview_ready": preview_mesh is not None,
            "preview_model_path": preview_mesh,
        }
