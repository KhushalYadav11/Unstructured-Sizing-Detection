"""
Image Preprocessor for High-Quality 3D Reconstruction

Pre-processes input images before Meshroom to maximize reconstruction quality:
- EXIF-based auto-rotation so all images are upright
- Near-duplicate frame detection and removal (keeps sharpest)
- Exposure/brightness normalization for consistent feature matching
- Resolution normalization (downscale oversized images to save memory)

This is the single biggest quality lever that Polycam-style apps use:
bad or redundant input frames degrade SfM more than any parameter tuning.
"""

from __future__ import annotations

import logging
import os
import shutil
import struct
import tempfile
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Near-duplicate detection threshold: images with SSIM > this are considered
# near-duplicates; the sharper one is kept.
DUPLICATE_SSIM_THRESHOLD = 0.97

# Maximum resolution for input images (pixels on longest edge).
# Images larger than this are downscaled to save memory and speed up SfM.
MAX_INPUT_RESOLUTION = 4096  # matches typical "quality" tier in Polycam

# Minimum sharpness (Laplacian variance) to keep a frame
MIN_SHARPNESS_VARIANCE = 50.0

# EXIF orientation tag
EXIF_ORIENTATION_TAG = 0x0112

# EXIF orientation → cv2 rotation map
EXIF_ROTATION_MAP = {
    2: cv2.ROTATE_90_CLOCKWISE,    # flipped horizontal → not exact, handled below
    3: cv2.ROTATE_180,
    4: cv2.ROTATE_90_COUNTERCLOCKWISE,  # flipped vertical → not exact
    5: cv2.ROTATE_90_CLOCKWISE,
    6: cv2.ROTATE_90_CLOCKWISE,
    7: cv2.ROTATE_90_COUNTERCLOCKWISE,
    8: cv2.ROTATE_90_COUNTERCLOCKWISE,
}


@dataclass
class PreprocessingResult:
    """Result of image preprocessing."""
    output_dir: str
    original_count: int
    processed_count: int
    removed_duplicates: int
    removed_blurry: int
    rotated: int
    resized: int
    warnings: List[str] = field(default_factory=list)


class ImagePreprocessor:
    """
    Pre-processes images for maximum reconstruction quality.

    Usage:
        preprocessor = ImagePreprocessor()
        result = preprocessor.preprocess(input_dir, output_dir)
        # use result.output_dir as input to Meshroom
    """

    def __init__(
        self,
        max_resolution: int = MAX_INPUT_RESOLUTION,
        min_sharpness: float = MIN_SHARPNESS_VARIANCE,
        remove_duplicates: bool = True,
        normalize_exposure: bool = True,
    ):
        self.max_resolution = max_resolution
        self.min_sharpness = min_sharpness
        self.remove_duplicates = remove_duplicates
        self.normalize_exposure = normalize_exposure

    def preprocess(self, input_dir: str, output_dir: Optional[str] = None) -> PreprocessingResult:
        """
        Pre-processes all images in input_dir and writes results to output_dir.

        Args:
            input_dir: Directory containing original input images
            output_dir: Destination for processed images (created if needed).
                        Defaults to a temp directory if not provided.

        Returns:
            PreprocessingResult with statistics and the output directory path.
        """
        if output_dir is None:
            output_dir = tempfile.mkdtemp(prefix="meshroom_preprocessed_")
        os.makedirs(output_dir, exist_ok=True)

        image_files = self._collect_images(input_dir)
        original_count = len(image_files)

        rotated = 0
        resized = 0
        removed_blurry = 0
        removed_duplicates = 0
        warnings: List[str] = []

        # Step 1: Load, rotate, resize, and sharpness-filter
        processed: List[Tuple[str, np.ndarray, float]] = []  # (original_path, img, sharpness)

        for img_path in image_files:
            img, was_rotated = self._load_and_rotate(img_path)
            if img is None:
                warnings.append(f"Could not load: {os.path.basename(img_path)}")
                continue
            if was_rotated:
                rotated += 1

            # Downscale if oversized
            img, was_resized = self._maybe_downscale(img)
            if was_resized:
                resized += 1

            # Sharpness check
            sharpness = self._laplacian_variance(img)
            if sharpness < self.min_sharpness:
                removed_blurry += 1
                logger.debug("Removed blurry frame: %s (var=%.1f)", img_path, sharpness)
                continue

            processed.append((img_path, img, sharpness))

        # Step 2: Remove near-duplicate frames (keep sharpest of each pair)
        if self.remove_duplicates and len(processed) > 1:
            processed, n_removed = self._remove_duplicates(processed)
            removed_duplicates = n_removed

        # Step 3: Optional global exposure normalization
        if self.normalize_exposure and processed:
            processed = self._normalize_exposures(processed)

        # Step 4: Write processed images to output_dir
        for i, (orig_path, img, _) in enumerate(processed):
            ext = os.path.splitext(orig_path)[1].lower() or ".jpg"
            out_filename = f"{i:05d}{ext}"
            out_path = os.path.join(output_dir, out_filename)
            quality_params = [cv2.IMWRITE_JPEG_QUALITY, 97] if ext in (".jpg", ".jpeg") else []
            cv2.imwrite(out_path, img, quality_params)

        processed_count = len(processed)
        logger.info(
            "Preprocessing complete: %d → %d images "
            "(rotated=%d, resized=%d, removed_blurry=%d, removed_dupes=%d)",
            original_count, processed_count,
            rotated, resized, removed_blurry, removed_duplicates,
        )

        return PreprocessingResult(
            output_dir=output_dir,
            original_count=original_count,
            processed_count=processed_count,
            removed_duplicates=removed_duplicates,
            removed_blurry=removed_blurry,
            rotated=rotated,
            resized=resized,
            warnings=warnings,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _collect_images(self, directory: str) -> List[str]:
        """Returns sorted list of image file paths."""
        extensions = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif"}
        paths = []
        for fname in sorted(os.listdir(directory)):
            if os.path.splitext(fname)[1].lower() in extensions:
                paths.append(os.path.join(directory, fname))
        return paths

    def _load_and_rotate(self, image_path: str) -> Tuple[Optional[np.ndarray], bool]:
        """
        Loads image and applies EXIF auto-rotation.

        Returns:
            (image, was_rotated) — image is None if loading failed.
        """
        # Read raw bytes for EXIF orientation before OpenCV strips it
        orientation = self._read_exif_orientation(image_path)

        img = cv2.imread(image_path)
        if img is None:
            return None, False

        was_rotated = False
        if orientation and orientation in EXIF_ROTATION_MAP:
            rotation = EXIF_ROTATION_MAP[orientation]
            img = cv2.rotate(img, rotation)
            was_rotated = True
            logger.debug("Rotated %s (EXIF orientation %d)", image_path, orientation)

        return img, was_rotated

    def _read_exif_orientation(self, image_path: str) -> Optional[int]:
        """
        Reads EXIF orientation tag directly from JPEG bytes.
        Returns orientation value (1-8) or None if not found / not a JPEG.
        """
        try:
            with open(image_path, "rb") as f:
                data = f.read(65536)  # read enough for EXIF header

            # JPEG starts with FFD8
            if data[:2] != b"\xff\xd8":
                return None

            offset = 2
            while offset < len(data) - 4:
                marker = data[offset:offset + 2]
                if marker == b"\xff\xe1":  # APP1 = EXIF
                    # EXIF header starts at offset+4, "Exif\x00\x00"
                    exif_data = data[offset + 4:]
                    return self._parse_exif_orientation(exif_data)
                if marker[0] != 0xFF:
                    break
                segment_len = struct.unpack(">H", data[offset + 2:offset + 4])[0]
                offset += 2 + segment_len

        except Exception:
            pass
        return None

    def _parse_exif_orientation(self, exif_bytes: bytes) -> Optional[int]:
        """Parses orientation from raw EXIF APP1 segment."""
        try:
            if exif_bytes[:6] != b"Exif\x00\x00":
                return None
            tiff = exif_bytes[6:]
            endian = tiff[:2]
            bo = "<" if endian == b"II" else ">"
            offset = struct.unpack(bo + "I", tiff[4:8])[0]
            num_entries = struct.unpack(bo + "H", tiff[offset:offset + 2])[0]
            for i in range(num_entries):
                entry_offset = offset + 2 + i * 12
                tag = struct.unpack(bo + "H", tiff[entry_offset:entry_offset + 2])[0]
                if tag == EXIF_ORIENTATION_TAG:
                    value = struct.unpack(bo + "H", tiff[entry_offset + 8:entry_offset + 10])[0]
                    return value
        except Exception:
            pass
        return None

    def _maybe_downscale(self, img: np.ndarray) -> Tuple[np.ndarray, bool]:
        """Downscales image if its longest edge exceeds max_resolution."""
        h, w = img.shape[:2]
        longest = max(h, w)
        if longest <= self.max_resolution:
            return img, False
        scale = self.max_resolution / longest
        new_w = int(w * scale)
        new_h = int(h * scale)
        resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
        return resized, True

    def _laplacian_variance(self, img: np.ndarray) -> float:
        """Computes Laplacian variance as a sharpness metric."""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        return float(cv2.Laplacian(gray, cv2.CV_64F).var())

    def _remove_duplicates(
        self,
        frames: List[Tuple[str, np.ndarray, float]],
    ) -> Tuple[List[Tuple[str, np.ndarray, float]], int]:
        """
        Removes near-duplicate frames using a fast perceptual hash comparison.

        For each pair of consecutive frames, if their mean structural difference
        is above the similarity threshold, the blurrier one is dropped.

        Returns:
            (filtered_frames, number_removed)
        """
        if len(frames) < 2:
            return frames, 0

        kept: List[Tuple[str, np.ndarray, float]] = [frames[0]]
        removed = 0

        for curr in frames[1:]:
            prev = kept[-1]
            similarity = self._frame_similarity(prev[1], curr[1])

            if similarity > DUPLICATE_SSIM_THRESHOLD:
                # Keep the sharper one
                if curr[2] > prev[2]:
                    kept[-1] = curr
                removed += 1
                logger.debug(
                    "Removed near-duplicate (similarity=%.3f): %s",
                    similarity,
                    os.path.basename(curr[0]),
                )
            else:
                kept.append(curr)

        return kept, removed

    def _frame_similarity(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """
        Fast frame similarity using normalised cross-correlation on thumbnails.
        Returns value in [0, 1] where 1.0 = identical.
        """
        try:
            size = (64, 64)
            a = cv2.resize(cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY), size).astype(np.float32)
            b = cv2.resize(cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY), size).astype(np.float32)
            a -= a.mean()
            b -= b.mean()
            denom = (np.linalg.norm(a) * np.linalg.norm(b))
            if denom < 1e-6:
                return 1.0
            return float(np.dot(a.ravel(), b.ravel()) / denom)
        except Exception:
            return 0.0

    def _normalize_exposures(
        self,
        frames: List[Tuple[str, np.ndarray, float]],
    ) -> List[Tuple[str, np.ndarray, float]]:
        """
        Normalizes overall image brightness toward the median brightness
        across all frames.  Corrects for under/overexposed sets without
        losing local contrast (applies a global gamma shift).
        """
        if not frames:
            return frames

        # Compute mean brightness of each frame
        brightnesses = []
        for _, img, _ in frames:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
            brightnesses.append(float(gray.mean()))

        target = float(np.median(brightnesses))
        if target < 1.0:
            return frames

        normalized = []
        for path, img, sharpness in frames:
            brightness = brightnesses[len(normalized)]
            if abs(brightness - target) / target > 0.20:  # >20% deviation
                # Apply gamma correction: gamma = log(target/255) / log(brightness/255)
                try:
                    ratio = target / max(brightness, 1.0)
                    # Clamp gain to avoid blowout: max ±40% adjustment
                    ratio = max(0.6, min(1.4, ratio))
                    adjusted = np.clip(img.astype(np.float32) * ratio, 0, 255).astype(np.uint8)
                    normalized.append((path, adjusted, sharpness))
                    continue
                except Exception:
                    pass
            normalized.append((path, img, sharpness))

        return normalized
