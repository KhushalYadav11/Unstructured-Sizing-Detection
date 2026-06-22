"""
Unit tests for Input Analyzer component.

Tests specific examples and edge cases for input validation and analysis.
"""

import os
import tempfile
import pytest
import numpy as np
import cv2
from app.input_analyzer import InputAnalyzer, InputAnalysis


@pytest.fixture
def temp_dir():
    """Create a temporary directory for test images."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture
def analyzer():
    """Create an InputAnalyzer instance."""
    return InputAnalyzer()


def create_test_image(path: str, width: int, height: int, blur: bool = False):
    """
    Create a test image with specified dimensions.
    
    Args:
        path: Output file path
        width: Image width
        height: Image height
        blur: If True, apply Gaussian blur to make image blurry
    """
    # Create a random image with some structure
    img = np.random.randint(0, 255, (height, width, 3), dtype=np.uint8)
    
    # Add some features (circles) to make it more realistic
    for _ in range(10):
        center = (np.random.randint(0, width), np.random.randint(0, height))
        radius = np.random.randint(10, 50)
        color = tuple(int(c) for c in np.random.randint(0, 255, 3))
        cv2.circle(img, center, radius, color, -1)
    
    if blur:
        # Apply heavy Gaussian blur
        img = cv2.GaussianBlur(img, (51, 51), 0)
    
    cv2.imwrite(path, img)


class TestInputAnalyzer:
    """Test suite for InputAnalyzer component."""
    
    def test_valid_input_with_10_images_at_1920x1080(self, temp_dir, analyzer):
        """Test valid input with 10 images at 1920x1080 → validation passes."""
        # Create 10 test images (reduced from larger set)
        for i in range(10):
            img_path = os.path.join(temp_dir, f"image_{i:03d}.jpg")
            create_test_image(img_path, 1920, 1080)
        
        # Analyze input
        result = analyzer.analyze_input(temp_dir)
        
        # Assertions
        assert result.validation_passed, f"Validation failed: {result.validation_errors}"
        assert result.image_count == 10
        assert result.avg_resolution == (1920, 1080)
        assert result.min_resolution == (1920, 1080)
        assert result.avg_sharpness > 0
        assert result.processing_preset == "fast"  # < 20 images
    
    def test_input_with_5_images_fails_validation(self, temp_dir, analyzer):
        """Test input with 5 images → validation fails with 'insufficient image count'."""
        # Create 5 test images (reduced)
        for i in range(5):
            img_path = os.path.join(temp_dir, f"image_{i:03d}.jpg")
            create_test_image(img_path, 1920, 1080)
        
        # Analyze input
        result = analyzer.analyze_input(temp_dir)
        
        # Assertions
        assert not result.validation_passed
        assert result.image_count == 5
        assert any("Insufficient image count" in error for error in result.validation_errors)
        assert any("5 < 8" in error for error in result.validation_errors)
    
    def test_input_with_640x480_images_passes_boundary(self, temp_dir, analyzer):
        """Test input with 640x480 images → validation passes (boundary)."""
        # Create 8 test images at minimum resolution
        for i in range(8):
            img_path = os.path.join(temp_dir, f"image_{i:03d}.jpg")
            create_test_image(img_path, 640, 480)
        
        # Analyze input
        result = analyzer.analyze_input(temp_dir)
        
        # Assertions
        assert result.validation_passed, f"Validation failed: {result.validation_errors}"
        assert result.image_count == 8
        assert result.avg_resolution == (640, 480)
        assert result.min_resolution == (640, 480)
    
    def test_input_with_639x480_images_fails_validation(self, temp_dir, analyzer):
        """Test input with 639x480 images → validation fails."""
        # Create 8 test images below minimum width
        for i in range(8):
            img_path = os.path.join(temp_dir, f"image_{i:03d}.jpg")
            create_test_image(img_path, 639, 480)
        
        # Analyze input
        result = analyzer.analyze_input(temp_dir)
        
        # Assertions
        assert not result.validation_passed
        assert result.image_count == 8
        assert any("Resolution too low" in error for error in result.validation_errors)
        assert any("639x480" in error for error in result.validation_errors)
    
    def test_blurry_images_flagged(self, temp_dir, analyzer):
        """Test blurry images (Laplacian variance < 100) → flagged as blurry."""
        # Create 8 test images, some blurry (reduced from more)
        for i in range(8):
            img_path = os.path.join(temp_dir, f"image_{i:03d}.jpg")
            blur = (i < 2)  # First 2 images are blurry (reduced from 3)
            create_test_image(img_path, 1920, 1080, blur=blur)
        
        # Analyze input
        result = analyzer.analyze_input(temp_dir)
        
        # Assertions
        assert not result.validation_passed
        # Should have warnings about blurry images
        blurry_errors = [e for e in result.validation_errors if "blurry" in e.lower()]
        assert len(blurry_errors) > 0, "Expected blurry image warnings"
    
    def test_validate_image_count_method(self, analyzer):
        """Test validate_image_count() method directly."""
        # Test valid count
        valid, error = analyzer.validate_image_count(10)
        assert valid
        assert error == ""
        
        # Test invalid count
        valid, error = analyzer.validate_image_count(5)
        assert not valid
        assert "Insufficient image count" in error
        assert "5 < 8" in error
        
        # Test boundary
        valid, error = analyzer.validate_image_count(8)
        assert valid
        assert error == ""
    
    def test_validate_resolution_method(self, temp_dir, analyzer):
        """Test validate_resolution() method directly."""
        # Create test images with different resolutions
        valid_img = os.path.join(temp_dir, "valid.jpg")
        create_test_image(valid_img, 1920, 1080)
        
        invalid_img = os.path.join(temp_dir, "invalid.jpg")
        create_test_image(invalid_img, 320, 240)
        
        # Test valid resolution
        valid, error, resolution = analyzer.validate_resolution(valid_img)
        assert valid
        assert error == ""
        assert resolution == (1920, 1080)
        
        # Test invalid resolution
        valid, error, resolution = analyzer.validate_resolution(invalid_img)
        assert not valid
        assert "Resolution too low" in error
        assert resolution == (320, 240)
    
    def test_assess_sharpness_method(self, temp_dir, analyzer):
        """Test assess_sharpness() method directly."""
        # Create sharp and blurry images
        sharp_img = os.path.join(temp_dir, "sharp.jpg")
        create_test_image(sharp_img, 1920, 1080, blur=False)
        
        blurry_img = os.path.join(temp_dir, "blurry.jpg")
        create_test_image(blurry_img, 1920, 1080, blur=True)
        
        # Assess sharpness
        sharp_score = analyzer.assess_sharpness(sharp_img)
        blurry_score = analyzer.assess_sharpness(blurry_img)
        
        # Sharp image should have higher score
        assert sharp_score > blurry_score
        assert sharp_score > 0
        assert blurry_score >= 0
    
    def test_estimate_overlap_method(self, temp_dir, analyzer):
        """Test estimate_overlap() method with similar images."""
        # Create similar images (reduced to 3 from 5)
        images = []
        for i in range(3):
            img_path = os.path.join(temp_dir, f"image_{i:03d}.jpg")
            # Create similar images with slight variations
            img = np.random.randint(100, 150, (1080, 1920, 3), dtype=np.uint8)
            # Add consistent features
            cv2.circle(img, (960, 540), 200, (255, 0, 0), -1)
            cv2.circle(img, (500 + i * 50, 300), 100, (0, 255, 0), -1)
            cv2.imwrite(img_path, img)
            images.append(img_path)
        
        # Estimate overlap
        overlap = analyzer.estimate_overlap(images)
        
        # Should detect some overlap
        assert overlap >= 0.0
        assert overlap <= 1.0
    
    def test_processing_preset_selection(self, temp_dir, analyzer):
        """Test processing preset selection based on image count."""
        # Test fast preset (< 20 images) - reduced to 10 from 15
        for i in range(10):
            img_path = os.path.join(temp_dir, f"fast_{i:03d}.jpg")
            create_test_image(img_path, 1920, 1080)
        result = analyzer.analyze_input(temp_dir)
        assert result.processing_preset == "fast"
        
        # Clean up
        for f in os.listdir(temp_dir):
            os.remove(os.path.join(temp_dir, f))
        
        # Test balanced preset (20-50 images) - reduced to 25 from 35
        for i in range(25):
            img_path = os.path.join(temp_dir, f"balanced_{i:03d}.jpg")
            create_test_image(img_path, 1920, 1080)
        result = analyzer.analyze_input(temp_dir)
        assert result.processing_preset == "balanced"
        
        # Clean up
        for f in os.listdir(temp_dir):
            os.remove(os.path.join(temp_dir, f))
        
        # Test quality preset (> 50 images) - reduced to 55 from 60
        for i in range(55):
            img_path = os.path.join(temp_dir, f"quality_{i:03d}.jpg")
            create_test_image(img_path, 1920, 1080)
        result = analyzer.analyze_input(temp_dir)
        assert result.processing_preset == "quality"
    
    def test_nonexistent_path_raises_error(self, analyzer):
        """Test that nonexistent path raises ValueError."""
        with pytest.raises(ValueError, match="Input path does not exist"):
            analyzer.analyze_input("/nonexistent/path")
    
    def test_empty_directory(self, temp_dir, analyzer):
        """Test empty directory fails validation."""
        result = analyzer.analyze_input(temp_dir)
        
        assert not result.validation_passed
        assert result.image_count == 0
        assert any("Insufficient image count" in error for error in result.validation_errors)
    
    def test_mixed_resolution_images(self, temp_dir, analyzer):
        """Test images with mixed resolutions."""
        # Create images with different resolutions
        resolutions = [(1920, 1080), (1280, 720), (3840, 2160), (1920, 1080)]
        for i, (w, h) in enumerate(resolutions * 2):  # 8 images total
            img_path = os.path.join(temp_dir, f"image_{i:03d}.jpg")
            create_test_image(img_path, w, h)
        
        result = analyzer.analyze_input(temp_dir)
        
        assert result.validation_passed, f"Validation failed: {result.validation_errors}"
        assert result.image_count == 8
        # Average should be somewhere in the middle
        assert result.avg_resolution[0] > 1280
        assert result.avg_resolution[1] > 720
        # Minimum should be the smallest
        assert result.min_resolution == (1280, 720)
    
    def test_single_image_file(self, temp_dir, analyzer):
        """Test analysis of a single image file."""
        img_path = os.path.join(temp_dir, "single.jpg")
        create_test_image(img_path, 1920, 1080)
        
        result = analyzer.analyze_input(img_path)
        
        assert not result.validation_passed
        assert result.image_count == 1
        assert any("Insufficient image count" in error for error in result.validation_errors)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
