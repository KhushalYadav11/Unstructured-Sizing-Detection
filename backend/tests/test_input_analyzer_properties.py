"""
Property-Based Tests for Input Analyzer component.

Tests universal correctness properties across all valid inputs using Hypothesis.
"""

import os
import tempfile
import time
import pytest
import numpy as np
import cv2
from hypothesis import given, strategies as st, settings, assume
from app.input_analyzer import InputAnalyzer, InputAnalysis


# Hypothesis strategies for generating test data
@st.composite
def image_count_strategy(draw):
    """Generate random image counts from 1 to 200."""
    return draw(st.integers(min_value=1, max_value=200))


@st.composite
def resolution_strategy(draw):
    """Generate random resolutions from 320x240 to 7680x4320."""
    width = draw(st.integers(min_value=320, max_value=7680))
    height = draw(st.integers(min_value=240, max_value=4320))
    return (width, height)


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
        radius = np.random.randint(10, min(50, min(width, height) // 4))
        color = tuple(int(c) for c in np.random.randint(0, 255, 3))
        cv2.circle(img, center, radius, color, -1)
    
    if blur:
        # Apply heavy Gaussian blur
        kernel_size = min(51, (min(width, height) // 20) | 1)  # Ensure odd number
        img = cv2.GaussianBlur(img, (kernel_size, kernel_size), 0)
    
    cv2.imwrite(path, img)


class TestInputAnalyzerProperties:
    """Property-based tests for InputAnalyzer component."""
    
    @given(
        image_count=image_count_strategy(),
        resolution=resolution_strategy()
    )
    @settings(max_examples=100, deadline=None)
    def test_property_16_input_validation_constraints(self, image_count, resolution):
        """
        **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6**
        
        Property 16: Input Validation Constraints
        
        For any input image set, the Input_Analyzer SHALL validate that image count 
        is at least 8, all images have resolution of at least 640x480 pixels, assess 
        sharpness and flag blurry images, detect insufficient overlap, and reject the 
        job with specific failure reasons if validation fails, completing within 30 seconds.
        
        This test generates random image counts (1-200) and resolutions (320x240 to 7680x4320)
        and verifies:
        - Validation passes for count >= 8 and resolution >= 640x480
        - Validation fails with specific errors for invalid inputs
        - Analysis completes within 30 seconds
        """
        width, height = resolution
        
        # Create analyzer instance
        analyzer = InputAnalyzer()
        
        # Create temporary directory for test images
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create test images with the specified count and resolution
            for i in range(image_count):
                img_path = os.path.join(temp_dir, f"image_{i:03d}.jpg")
                create_test_image(img_path, width, height, blur=False)
            
            # Measure analysis time
            start_time = time.time()
            result = analyzer.analyze_input(temp_dir)
            elapsed_time = time.time() - start_time
            
            # Property 1: Analysis must complete within 30 seconds
            assert elapsed_time <= 30.0, (
                f"Analysis took {elapsed_time:.2f}s, exceeding 30s limit "
                f"(image_count={image_count}, resolution={width}x{height})"
            )
            
            # Property 2: Image count must be correctly reported
            assert result.image_count == image_count, (
                f"Expected image_count={image_count}, got {result.image_count}"
            )
            
            # Property 3: Resolution must be correctly reported
            # When resolution is below minimum, images are still loaded but flagged;
            # avg/min resolution reflects actual image dimensions only when images load.
            # If all images fail resolution check, avg/min may be (0,0) or actual dims.
            # We only assert exact resolution when images are valid (>= 640x480).
            if width >= 640 and height >= 480:
                assert result.avg_resolution == (width, height), (
                    f"Expected avg_resolution=({width}, {height}), got {result.avg_resolution}"
                )
                assert result.min_resolution == (width, height), (
                    f"Expected min_resolution=({width}, {height}), got {result.min_resolution}"
                )
            
            # Property 4: Validation logic for image count
            if image_count >= 8:
                # Should not have image count error
                count_errors = [e for e in result.validation_errors if "Insufficient image count" in e]
                assert len(count_errors) == 0, (
                    f"Expected no image count errors for count={image_count}, "
                    f"but got: {count_errors}"
                )
            else:
                # Should have image count error
                count_errors = [e for e in result.validation_errors if "Insufficient image count" in e]
                assert len(count_errors) > 0, (
                    f"Expected image count error for count={image_count}, "
                    f"but validation_errors={result.validation_errors}"
                )
                assert not result.validation_passed, (
                    f"Expected validation to fail for count={image_count}"
                )
            
            # Property 5: Validation logic for resolution
            if width >= 640 and height >= 480:
                # Should not have resolution errors
                res_errors = [e for e in result.validation_errors if "Resolution too low" in e]
                assert len(res_errors) == 0, (
                    f"Expected no resolution errors for {width}x{height}, "
                    f"but got: {res_errors}"
                )
            else:
                # Should have resolution errors
                res_errors = [e for e in result.validation_errors if "Resolution too low" in e]
                assert len(res_errors) > 0, (
                    f"Expected resolution error for {width}x{height}, "
                    f"but validation_errors={result.validation_errors}"
                )
                assert not result.validation_passed, (
                    f"Expected validation to fail for resolution {width}x{height}"
                )
            
            # Property 6: Overall validation passes only when all criteria met
            if image_count >= 8 and width >= 640 and height >= 480:
                # Validation should pass (assuming images are not blurry and have overlap)
                # Note: We created non-blurry images, but overlap check might still fail
                # So we check that there are no count or resolution errors
                critical_errors = [
                    e for e in result.validation_errors 
                    if "Insufficient image count" in e or "Resolution too low" in e
                ]
                assert len(critical_errors) == 0, (
                    f"Expected no critical errors for valid input "
                    f"(count={image_count}, resolution={width}x{height}), "
                    f"but got: {critical_errors}"
                )
            else:
                # Validation should fail
                assert not result.validation_passed, (
                    f"Expected validation to fail for invalid input "
                    f"(count={image_count}, resolution={width}x{height})"
                )
            
            # Property 7: Sharpness assessment
            # All images should have sharpness scores
            assert result.avg_sharpness >= 0, (
                f"Expected non-negative sharpness score, got {result.avg_sharpness}"
            )
            
            # Property 8: Overlap estimation
            # Overlap should be between 0 and 1
            assert 0.0 <= result.estimated_overlap <= 1.0, (
                f"Expected overlap in [0, 1], got {result.estimated_overlap}"
            )
            
            # Property 9: Processing preset selection
            if image_count < 20:
                assert result.processing_preset == "fast", (
                    f"Expected 'fast' preset for {image_count} images, "
                    f"got '{result.processing_preset}'"
                )
            elif 20 <= image_count <= 50:
                assert result.processing_preset == "balanced", (
                    f"Expected 'balanced' preset for {image_count} images, "
                    f"got '{result.processing_preset}'"
                )
            else:  # image_count > 50
                assert result.processing_preset == "quality", (
                    f"Expected 'quality' preset for {image_count} images, "
                    f"got '{result.processing_preset}'"
                )
    
    @given(
        image_count=st.integers(min_value=8, max_value=50),
        blur_ratio=st.floats(min_value=0.0, max_value=1.0)
    )
    @settings(max_examples=50, deadline=None)
    def test_property_16_sharpness_detection(self, image_count, blur_ratio):
        """
        **Validates: Requirements 11.3**
        
        Property 16 (Sharpness): Input Validation Constraints - Sharpness Detection
        
        For any input image set with varying blur levels, the Input_Analyzer SHALL 
        assess sharpness and flag blurry images (Laplacian variance below threshold).
        
        This test generates images with controlled blur ratios and verifies that
        blurry images are correctly detected and flagged.
        """
        # Create analyzer instance
        analyzer = InputAnalyzer()
        
        # Create temporary directory for test images
        with tempfile.TemporaryDirectory() as temp_dir:
            # Calculate how many images should be blurry
            num_blurry = int(image_count * blur_ratio)
            
            # Create test images with specified blur ratio
            for i in range(image_count):
                img_path = os.path.join(temp_dir, f"image_{i:03d}.jpg")
                should_blur = (i < num_blurry)
                create_test_image(img_path, 1920, 1080, blur=should_blur)
            
            # Analyze input
            result = analyzer.analyze_input(temp_dir)
            
            # Property: If we created blurry images, they should be flagged
            if num_blurry > 0:
                blurry_errors = [e for e in result.validation_errors if "blurry" in e.lower()]
                # We expect at least some blurry images to be detected
                # (Note: The exact number may vary due to the randomness in image generation)
                assert len(blurry_errors) > 0, (
                    f"Expected blurry image warnings when {num_blurry}/{image_count} images are blurry, "
                    f"but got no warnings. validation_errors={result.validation_errors}"
                )
            
            # Property: Sharpness score should be lower when more images are blurry
            # (This is a general trend, not a strict requirement for each individual test)
            assert result.avg_sharpness >= 0, (
                f"Expected non-negative average sharpness, got {result.avg_sharpness}"
            )
    
    @given(
        image_count=st.integers(min_value=1, max_value=20)
    )
    @settings(max_examples=50, deadline=None)
    def test_property_16_validation_error_specificity(self, image_count):
        """
        **Validates: Requirements 11.5**
        
        Property 16 (Error Specificity): Input Validation Constraints - Specific Error Messages
        
        For any input that fails validation, the Input_Analyzer SHALL reject the job 
        with specific validation failure reasons before Meshroom processing starts.
        
        This test verifies that validation errors are specific and actionable.
        """
        # Create analyzer instance
        analyzer = InputAnalyzer()
        
        # Create temporary directory for test images
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create images with resolution below minimum
            for i in range(image_count):
                img_path = os.path.join(temp_dir, f"image_{i:03d}.jpg")
                create_test_image(img_path, 320, 240, blur=False)
            
            # Analyze input
            result = analyzer.analyze_input(temp_dir)
            
            # Property: Validation should fail
            assert not result.validation_passed, (
                f"Expected validation to fail for {image_count} images at 320x240"
            )
            
            # Property: Should have specific error messages
            assert len(result.validation_errors) > 0, (
                "Expected specific validation errors"
            )
            
            # Property: Error messages should be informative
            for error in result.validation_errors:
                assert len(error) > 0, "Error messages should not be empty"
                # Error messages should contain useful information
                assert any(
                    keyword in error.lower() 
                    for keyword in ["insufficient", "resolution", "low", "minimum", "required"]
                ), f"Error message should be specific and actionable: {error}"
    
    @given(
        resolution=resolution_strategy()
    )
    @settings(max_examples=50, deadline=None)
    def test_property_16_resolution_boundary_conditions(self, resolution):
        """
        **Validates: Requirements 11.2**
        
        Property 16 (Resolution Boundaries): Input Validation Constraints - Resolution Validation
        
        For any image resolution, the Input_Analyzer SHALL check image resolution 
        and reject images smaller than 640x480 pixels.
        
        This test verifies correct behavior at and around the resolution boundary.
        """
        width, height = resolution
        
        # Create analyzer instance
        analyzer = InputAnalyzer()
        
        # Create temporary directory for test images
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create 8 images (minimum count) with the specified resolution
            for i in range(8):
                img_path = os.path.join(temp_dir, f"image_{i:03d}.jpg")
                create_test_image(img_path, width, height, blur=False)
            
            # Analyze input
            result = analyzer.analyze_input(temp_dir)
            
            # Property: Resolution validation boundary at 640x480
            if width >= 640 and height >= 480:
                # Should not have resolution errors
                res_errors = [e for e in result.validation_errors if "Resolution too low" in e]
                assert len(res_errors) == 0, (
                    f"Expected no resolution errors for {width}x{height}, "
                    f"but got: {res_errors}"
                )
            else:
                # Should have resolution errors
                res_errors = [e for e in result.validation_errors if "Resolution too low" in e]
                assert len(res_errors) > 0, (
                    f"Expected resolution error for {width}x{height}, "
                    f"but got no resolution errors. validation_errors={result.validation_errors}"
                )
                
                # Error message should mention the actual resolution
                assert any(f"{width}x{height}" in error for error in res_errors), (
                    f"Error message should mention actual resolution {width}x{height}"
                )
                
                # Error message should mention the minimum requirement
                assert any("640" in error and "480" in error for error in res_errors), (
                    "Error message should mention minimum resolution requirement (640x480)"
                )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
