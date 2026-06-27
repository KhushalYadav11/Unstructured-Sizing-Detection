# Quick Start Checklist - Fixed System

## ✅ Completed Steps

- [x] Dependencies installed (`npm install`)
- [x] Environment variables configured (`.env` updated)
- [x] Quality settings upgraded to ultra
- [x] Image validation system added
- [x] Frontend status update fixed

## 🚀 Next Steps

### 1. Verify NodeODM is Running

```bash
# Check if NodeODM container is running
docker ps

# If not running, start it:
docker run -p 3000:3000 opendronemap/nodeodm

# Test if it's accessible:
curl http://localhost:3000/info
```

### 2. Restart Your Development Server

```bash
# In the Coal-estimates directory:
npm run dev
```

### 3. Prepare Your Images

**CRITICAL**: Follow these guidelines or reconstruction will fail:

#### Minimum Requirements:
- ✅ At least 50 images (100-150 recommended)
- ✅ 70-80% overlap between consecutive images
- ✅ Resolution: 1920x1080 or higher
- ✅ All images sharp and in focus
- ✅ Consistent lighting

#### Capture Pattern:
1. **Ring 1** - Walk around pile at ground level (30-40 images)
2. **Ring 2** - Walk around pile at mid height (30-40 images)
3. **Ring 3** - Walk around pile from elevated position (30-40 images)
4. **Top-down** - Overhead shots covering entire pile (20+ images)

**Total: 100-150 images minimum**

📖 **Read the full guide**: `PHOTOGRAMMETRY_BEST_PRACTICES.md`

### 4. Upload and Process

1. Open the application in your browser
2. Navigate to "3D Reconstruction"
3. Select your images (all 100-150 of them)
4. Click "Start Reconstruction"
5. Watch for validation warnings
6. Wait 30-60 minutes for processing

### 5. Expected Results

**With Good Images:**
- ✅ Solid, continuous mesh
- ✅ No holes or fragmentation
- ✅ Accurate dimensions
- ✅ Good textures
- ✅ Ready for measurements

**With Poor Images:**
- ❌ Fragmented geometry (like your previous result)
- ❌ Holes and gaps
- ❌ Unusable for measurements

## 🔍 Troubleshooting

### If Frontend Doesn't Update:
1. Check browser console for errors
2. Verify server is running
3. Check that NodeODM is accessible
4. Clear browser cache and reload

### If Quality is Still Poor:
**Most likely cause**: Your images don't follow the guidelines above

**Solutions**:
1. Verify 70-80% overlap (use slideshow test in guide)
2. Count your images (need 100+, not 40)
3. Check image quality (all sharp, no blur)
4. Ensure complete 360° coverage from multiple heights

### If Validation Fails:
- Read the error messages carefully
- Common issues:
  - Too few images
  - Low resolution images
  - Corrupted files
  - Mixed resolutions

## 📊 Quality Settings Explained

Your current settings (ultra quality):
- **Processing time**: 30-60 minutes for 100 images
- **Mesh triangles**: 500,000 (high detail)
- **Quality**: Excellent for measurements
- **File size**: Large (~50-200MB)

To adjust quality, edit `.env`:
- **Fast preview**: Change all to `low` (5-10 min, poor quality)
- **Balanced**: Change all to `high` (15-30 min, good quality)
- **Maximum**: Change `MESH_SIZE` to `1000000` (1-3 hours, best quality)

## 📚 Documentation

- `FIXES_APPLIED.md` - What was changed and why
- `RECONSTRUCTION_QUALITY_GUIDE.md` - Quality settings guide
- `PHOTOGRAMMETRY_BEST_PRACTICES.md` - **READ THIS FIRST** - How to capture images

## ⚠️ Important Notes

1. **Photography is 90% of success** - No software can fix bad images
2. **Overlap is critical** - 70-80% overlap between consecutive images
3. **More images = better results** - Don't skimp on image count
4. **Systematic capture** - Follow the ring pattern, don't just walk around randomly
5. **Validation warnings** - Pay attention to them, they indicate problems

## 🎯 Success Criteria

Before uploading, verify:
- [ ] 100+ images captured
- [ ] Complete 360° coverage from 3+ heights
- [ ] All images sharp and well-exposed
- [ ] Consecutive images overlap 70-80%
- [ ] Slideshow test passes (looks like smooth video)
- [ ] No gaps in coverage

## 🆘 Still Having Issues?

1. Test with a simple object first (a box or rock)
2. Review server logs for detailed errors
3. Check NodeODM logs: `docker logs <container-id>`
4. Verify all images are valid (not corrupted)
5. Try with fewer images first (50) to test the pipeline

## 📞 Quick Reference

**Start NodeODM**: `docker run -p 3000:3000 opendronemap/nodeodm`
**Start Dev Server**: `npm run dev`
**Check NodeODM**: `curl http://localhost:3000/info`
**View Logs**: Check terminal where `npm run dev` is running

---

**Remember**: The #1 reason for poor reconstruction quality is insufficient image overlap and coverage. Follow the photography guide carefully!
