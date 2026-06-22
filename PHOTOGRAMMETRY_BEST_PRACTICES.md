# Photogrammetry Best Practices for Coal Pile Reconstruction

## Why Your Reconstruction Failed

Based on the fragmented output you're seeing, here are the most likely causes:

### 1. **Insufficient Image Overlap** (Most Common)
- **Problem**: Images don't overlap enough for the software to match features
- **Solution**: Each image should overlap 70-80% with neighboring images
- **How to check**: Look at consecutive photos - you should see mostly the same content

### 2. **Poor Camera Technique**
- **Problem**: Inconsistent camera angles, distance, or settings
- **Solution**: Follow the systematic capture pattern below

### 3. **Lighting Issues**
- **Problem**: Harsh shadows, varying light conditions between shots
- **Solution**: Shoot on overcast days or use consistent artificial lighting

### 4. **Motion Blur or Out of Focus**
- **Problem**: Camera movement or poor focus
- **Solution**: Use faster shutter speed, stabilize camera, use manual focus

## Correct Image Capture Technique

### Step-by-Step Process

#### 1. **Plan Your Shoot**
- Time: Overcast day or consistent lighting (avoid midday sun)
- Equipment: Camera with manual settings, tripod (optional but helpful)
- Minimum images: 50-100 for a coal pile
- Recommended: 100-200 images for best results

#### 2. **Camera Settings**
- **Resolution**: Maximum your camera supports (minimum 12MP)
- **ISO**: 100-400 (lower is better, less noise)
- **Shutter Speed**: 1/250s or faster (to avoid motion blur)
- **Aperture**: f/8 to f/11 (good depth of field)
- **Focus**: Manual focus, locked on the object
- **White Balance**: Locked (don't use auto)
- **Format**: RAW if possible, otherwise highest quality JPEG

#### 3. **Capture Pattern for Coal Piles**

**Ring 1 - Ground Level (30-40 images)**
- Walk in a complete circle around the pile
- Keep camera at waist height
- Take a photo every 3-5 steps
- Aim camera at the center of the pile
- 70-80% overlap between consecutive shots

**Ring 2 - Mid Level (30-40 images)**
- Walk the same circle
- Raise camera to eye level or use a pole
- Same spacing and overlap as Ring 1
- Angle camera slightly downward

**Ring 3 - High Level (30-40 images)**
- Walk the same circle
- Use a ladder, drone, or elevated position
- Look down at 45° angle
- Same spacing and overlap

**Top-Down Views (10-20 images)**
- If possible, capture directly from above
- Grid pattern covering the entire pile
- These are crucial for accurate volume measurement

**Detail Shots (Optional, 20-30 images)**
- Close-ups of complex areas
- Edges and boundaries
- Any features that need extra detail

### 4. **What to Avoid**

❌ **Don't:**
- Skip areas (every part must be visible in multiple photos)
- Change camera settings mid-shoot
- Shoot in changing light conditions
- Include moving objects (people, vehicles, flags)
- Shoot through glass or reflective surfaces
- Use digital zoom
- Rush the process

✅ **Do:**
- Take more photos than you think you need
- Maintain consistent distance from object
- Keep the entire pile in frame for each shot
- Include some background/context in each image
- Check focus and exposure as you go
- Take photos from multiple heights

## Image Quality Checklist

Before uploading, verify each image:

- [ ] **Sharp and in focus** - No blur when zoomed in
- [ ] **Properly exposed** - Not too dark or bright
- [ ] **Consistent lighting** - Similar brightness across all images
- [ ] **High resolution** - At least 1920x1080, preferably 4K+
- [ ] **Overlaps with neighbors** - 70-80% of content is shared
- [ ] **Covers all angles** - No blind spots
- [ ] **No motion blur** - Crisp edges
- [ ] **Good contrast** - Can see texture and details

## Common Mistakes and Fixes

### Mistake 1: "I walked around and took photos"
**Problem**: Random photos without systematic coverage
**Fix**: Follow the ring pattern above with measured spacing

### Mistake 2: "I took 20 photos"
**Problem**: Not enough images for reliable reconstruction
**Fix**: Minimum 50 images, recommended 100-200

### Mistake 3: "I used my phone on auto mode"
**Problem**: Varying settings, HDR processing, digital zoom
**Fix**: Lock exposure, disable HDR, use pro/manual mode

### Mistake 4: "I took photos from one side"
**Problem**: Missing coverage = holes in model
**Fix**: Complete 360° coverage from multiple heights

### Mistake 5: "The lighting kept changing"
**Problem**: Shadows move, colors shift = poor matching
**Fix**: Shoot quickly in consistent conditions

## Testing Your Images Before Processing

### Quick Validation Test:
1. Open 3 consecutive images
2. Can you see the same features in all 3?
3. Do they overlap by 70-80%?
4. Are they all sharp and well-exposed?

If you answered "no" to any question, retake the photos.

### Advanced Validation:
- Import images into photo viewer
- Play as slideshow at 2-3 images/second
- Should look like smooth video panning around object
- Any jumps or gaps = missing coverage

## Example: Good vs Bad Image Sets

### ❌ Bad Image Set (Will Fail)
- 20 images total
- All from ground level
- Taken while walking casually
- Some blurry, some overexposed
- Large gaps in coverage
- **Result**: Fragmented mesh with holes

### ✅ Good Image Set (Will Succeed)
- 120 images total
- 3 rings at different heights + top-down
- Systematic spacing with 75% overlap
- All sharp, consistent exposure
- Complete 360° coverage
- **Result**: Solid, detailed mesh

## Recommended Equipment

### Minimum:
- Smartphone with 12MP+ camera
- Steady hands or basic tripod
- Good lighting conditions

### Better:
- DSLR or mirrorless camera
- 24-70mm lens
- Tripod or monopod
- Overcast day or diffused lighting

### Best:
- High-resolution camera (20MP+)
- Prime lens (35mm or 50mm)
- Drone for aerial shots
- Controlled lighting setup
- Color calibration target

## After Capture Checklist

Before uploading to the system:

1. [ ] Review all images for sharpness
2. [ ] Delete any blurry or bad images
3. [ ] Verify complete coverage (no gaps)
4. [ ] Check that consecutive images overlap 70-80%
5. [ ] Confirm consistent lighting across set
6. [ ] Ensure minimum 50 images (recommend 100+)
7. [ ] Verify all images are same resolution
8. [ ] Remove any duplicate or nearly identical shots

## Processing Tips

### If Reconstruction Fails:
1. **Check image count**: Need 50+ images minimum
2. **Verify overlap**: Use slideshow test above
3. **Inspect quality**: All images sharp and well-exposed?
4. **Review coverage**: Any blind spots or gaps?
5. **Consider retaking**: Sometimes faster than troubleshooting

### If Quality is Poor:
1. **Increase image count**: More images = better quality
2. **Improve overlap**: 80% overlap is better than 70%
3. **Add more angles**: Especially top-down views
4. **Retake with better lighting**: Overcast conditions ideal
5. **Use higher resolution**: 4K better than 1080p

## Real-World Example

### Coal Pile Dimensions: 10m x 8m x 3m high

**Recommended Capture Plan:**
- **Ring 1** (ground, 2m from pile): 40 images
- **Ring 2** (2m height, 2m from pile): 40 images  
- **Ring 3** (3m height, 2m from pile): 40 images
- **Top-down** (drone or elevated): 20 images
- **Detail shots** (edges, features): 20 images
- **Total**: 160 images
- **Capture time**: 30-45 minutes
- **Processing time**: 45-90 minutes
- **Expected quality**: Excellent

## Summary: The 3 Keys to Success

1. **OVERLAP**: 70-80% between consecutive images
2. **COVERAGE**: Complete 360° from multiple heights
3. **QUALITY**: Sharp, consistent, high-resolution images

Follow these guidelines and your reconstructions will succeed!

## Need Help?

If you're still getting poor results after following this guide:
1. Check that NodeODM is running properly
2. Review the server logs for error messages
3. Try with a smaller test object first (a box or rock)
4. Consider using a professional photogrammetry service

## Additional Resources

- OpenDroneMap Documentation: https://docs.opendronemap.org/
- Photogrammetry Guide: https://www.agisoft.com/pdf/photogrammetry-guide.pdf
- Camera Settings Guide: https://www.capturingreality.com/camera-settings
