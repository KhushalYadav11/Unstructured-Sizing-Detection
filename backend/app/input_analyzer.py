"""
Input Analyzer Component for Meshroom Performance Optimization

This module provides input validation and analysis for photogrammetry reconstruction jobs.
It validates image count, resolution, sharpness, and overlap before processing begins.
"""

import os
import time
from dataclasses import dataclass, field
from typing import List, Tuple, Optional
import cv2
import numpy as np
from app.config import settings


@dataclass
class InputAnalysis:
    """Results of input image analysis and validation."""
    image_count: int
    avg_resolution: Tuple[int, int]
    min_resolution: Tuple[int, int]
    avg_sharpness: float
    estimated_overlap: float
    validation_passed: bool
    validation_errors: List[str] = field(default_factory=list)
    processing_preset: str = "balanced"  # "fast", "balanced", "quality"


class InputAnalyzer:
    """Analyzes and validates input images for photogrammetry reconstruction."""
    
    def __init__(self):
        self.min_image_count = settings.MIN_IMAGE_COUNT
        self.min_resolution_width = settings.MIN_IMAGE_RESOLUTION_WIDTH
        self.min_resolution_height = settings.MIN_IMAGE_RESOLUTION_HEIGHT
        self.sharpness_threshold = settings.SHARPNESS_THRESHOLD
    
    def analyze_input(self, input_path: str) -> InputAnalysis:
        """
        Analyzes input images and validates quality.
        
        Args:
            input_path: Path to directory containing input images or video file
            
        Returns:
            InputAnalysis object with validation results and characteristics
            
        Raises:
            ValueError: If input_path doesn't exist or is invalid
        """
        start_time = time.time()
        
        if not os.path.exists(input_path):
            raise ValueError(f"Input path does not exist: {input_path}")
        
        # Get list of image files
        image_files = self._get_image_files(input_path)
        
        # Initialize analysis results
        validation_errors = []
        
        # Validate image count
        count_valid, count_error = self.validate_image_count(len(image_files))
        if not count_valid:
            validation_errors.append(count_error)
        
        # Analyze image characteristics
        resolutions = []
        sharpness_scores = []
        
        for img_path in image_files:
            # Validate resolution
            res_valid, res_error, resolution = self.validate_resolution(img_path)
            if not res_valid:
                validation_errors.append(f"{os.path.basename(img_path)}: {res_error}")
            else:
                resolutions.append(resolution)
            
            # Assess sharpness
            try:
                sharpness = self.assess_sharpness(img_path)
                sharpness_scores.append(sharpness)
                
                if sharpness < self.sharpness_threshold:
                    validation_errors.append(
                        f"{os.path.basename(img_path)}: Image is blurry "
                        f"(sharpness {sharpness:.1f} < {self.sharpness_threshold})"
                    )
            except Exception as e:
                validation_errors.append(
                    f"{os.path.basename(img_path)}: Failed to assess sharpness: {str(e)}"
                )
        
        # Calculate average and minimum resolution
        if resolutions:
            avg_resolution = (
                int(np.mean([r[0] for r in resolutions])),
                int(np.mean([r[1] for r in resolutions]))
            )
            min_resolution = (
                min(r[0] for r in resolutions),
                min(r[1] for r in resolutions)
            )
        else:
            avg_resolution = (0, 0)
            min_resolution = (0, 0)
        
        # Calculate average sharpness
        avg_sharpness = float(np.mean(sharpness_scores)) if sharpness_scores else 0.0
        
        # Estimate overlap (only if we have valid images)
        estimated_overlap = 0.0
        if len(image_files) >= 2 and not validation_errors:
            try:
                estimated_overlap = self.estimate_overlap(image_files[:min(10, len(image_files))])
                
                # Warn if overlap is too low
                if estimated_overlap < 0.3:
                    validation_errors.append(
                        f"Insufficient image overlap detected ({estimated_overlap:.1%}). "
                        "Recommend at least 30% overlap between consecutive images."
                    )
            except Exception as e:
                validation_errors.append(f"Failed to estimate overlap: {str(e)}")
        
        # Determine processing preset based on image count
        if len(image_files) < 20:
            processing_preset = "fast"
        elif len(image_files) <= 50:
            processing_preset = "balanced"
        else:
            processing_preset = "quality"
        
        # Check if analysis completed within time limit (30 seconds)
        elapsed_time = time.time() - start_time
        if elapsed_time > 30:
            validation_errors.append(
                f"Input analysis took too long ({elapsed_time:.1f}s > 30s)"
            )
        
        # Validation passes if there are no errors
        validation_passed = len(validation_errors) == 0
        
        return InputAnalysis(
            image_count=len(image_files),
            avg_resolution=avg_resolution,
            min_resolution=min_resolution,
            avg_sharpness=avg_sharpness,
            estimated_overlap=estimated_overlap,
            validation_passed=validation_passed,
            validation_errors=validation_errors,
            processing_preset=processing_preset
        )
    
    def validate_image_count(self, count: int) -> Tuple[bool, str]:
        """
        Validates minimum image count.
        
        Args:
            count: Number of images
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if count < self.min_image_count:
            return False, f"Insufficient image count: {count} < {self.min_image_count} (minimum required)"
        return True, ""
    
    def validate_resolution(self, image_path: str) -> Tuple[bool, str, Optional[Tuple[int, int]]]:
        """
        Validates image resolution.
        
        Args:
            image_path: Path to image file
            
        Returns:
            Tuple of (is_valid, error_message, resolution)
            resolution is (width, height) or None if validation fails
        """
        try:
            img = cv2.imread(image_path)
            if img is None:
                return False, "Failed to load image", None
            
            height, width = img.shape[:2]
            
            if width < self.min_resolution_width or height < self.min_resolution_height:
                return False, (
                    f"Resolution too low: {width}x{height} < "
                    f"{self.min_resolution_width}x{self.min_resolution_height} (minimum required)"
                ), (width, height)
            
            return True, "", (width, height)
            
        except Exception as e:
            return False, f"Error reading image: {str(e)}", None
    
    def assess_sharpness(self, image_path: str) -> float:
        """
        Calculates image sharpness using Laplacian variance.
        
        Args:
            image_path: Path to image file
            
        Returns:
            Sharpness score (higher is sharper)
            
        Raises:
            ValueError: If image cannot be loaded
        """
        img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError(f"Failed to load image: {image_path}")
        
        # Calculate Laplacian variance
        laplacian = cv2.Laplacian(img, cv2.CV_64F)
        variance = laplacian.var()
        
        return float(variance)
    
    def estimate_overlap(self, images: List[str]) -> float:
        """
        Estimates image overlap using ORB feature detection and matching.
        
        Args:
            images: List of image file paths (typically first 10 images)
            
        Returns:
            Estimated overlap ratio (0.0 to 1.0)
            
        Raises:
            ValueError: If images cannot be processed
        """
        if len(images) < 2:
            return 0.0
        
        # Initialize ORB detector
        orb = cv2.ORB_create(nfeatures=1000)
        
        # Create BFMatcher
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        
        overlap_ratios = []
        
        # Compare consecutive image pairs
        for i in range(len(images) - 1):
            try:
                # Load images
                img1 = cv2.imread(images[i], cv2.IMREAD_GRAYSCALE)
                img2 = cv2.imread(images[i + 1], cv2.IMREAD_GRAYSCALE)
                
                if img1 is None or img2 is None:
                    continue
                
                # Detect keypoints and compute descriptors
                kp1, des1 = orb.detectAndCompute(img1, None)
                kp2, des2 = orb.detectAndCompute(img2, None)
                
                if des1 is None or des2 is None or len(kp1) == 0 or len(kp2) == 0:
                    continue
                
                # Match descriptors
                matches = bf.match(des1, des2)
                
                # Calculate overlap ratio based on matched features
                # Overlap = matches / min(features in both images)
                min_features = min(len(kp1), len(kp2))
                if min_features > 0:
                    overlap_ratio = len(matches) / min_features
                    overlap_ratios.append(min(overlap_ratio, 1.0))
                    
            except Exception as e:
                # Skip this pair if there's an error
                continue
        
        # Return average overlap ratio
        if overlap_ratios:
            return float(np.mean(overlap_ratios))
        else:
            return 0.0
    
    def _get_image_files(self, input_path: str) -> List[str]:
        """
        Gets list of image files from input path.
        
        Args:
            input_path: Path to directory or file
            
        Returns:
            List of image file paths
        """
        image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'}
        
        if os.path.isfile(input_path):
            # Single file - check if it's an image
            ext = os.path.splitext(input_path)[1].lower()
            if ext in image_extensions:
                return [input_path]
            else:
                return []
        
        elif os.path.isdir(input_path):
            # Directory - find all image files
            image_files = []
            for filename in sorted(os.listdir(input_path)):
                ext = os.path.splitext(filename)[1].lower()
                if ext in image_extensions:
                    image_files.append(os.path.join(input_path, filename))
            return image_files
        
        else:
            return []
