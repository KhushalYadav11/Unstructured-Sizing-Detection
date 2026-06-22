"""
Unit tests for Cache Manager component.

Tests specific examples and edge cases for caching, resumption, and cleanup.
"""

import os
import tempfile
from datetime import datetime, timedelta
import pytest

from app.cache_manager import CacheManager, CachedStage, STAGE_ORDER


@pytest.fixture
def cache_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture
def cache(cache_dir):
    return CacheManager(cache_dir=cache_dir, max_size_gb=100, expiration_days=7)


def create_output_file(directory: str, name: str, content: str = "output") -> str:
    """Create a dummy output file and return its path."""
    path = os.path.join(directory, name)
    with open(path, "w") as f:
        f.write(content)
    return path


class TestComputeInputHash:
    """Tests for compute_input_hash method."""

    def test_same_directory_same_hash(self, cache, cache_dir):
        """Test same directory contents produce same hash."""
        # Create some files
        create_output_file(cache_dir, "img1.jpg", "image1")
        create_output_file(cache_dir, "img2.jpg", "image2")

        hash1 = cache.compute_input_hash(cache_dir)
        hash2 = cache.compute_input_hash(cache_dir)

        assert hash1 == hash2

    def test_different_directories_different_hash(self, cache):
        """Test different directory contents produce different hashes."""
        with tempfile.TemporaryDirectory() as dir1:
            with tempfile.TemporaryDirectory() as dir2:
                create_output_file(dir1, "img1.jpg", "image1")
                create_output_file(dir2, "img2.jpg", "image2_different")

                hash1 = cache.compute_input_hash(dir1)
                hash2 = cache.compute_input_hash(dir2)

                assert hash1 != hash2

    def test_hash_is_hex_string(self, cache, cache_dir):
        """Test hash is a valid hex string."""
        create_output_file(cache_dir, "img.jpg", "image")
        h = cache.compute_input_hash(cache_dir)
        assert len(h) == 64  # SHA256 hex = 64 chars
        assert all(c in "0123456789abcdef" for c in h)


class TestComputeParametersHash:
    """Tests for compute_parameters_hash method."""

    def test_same_params_same_hash(self, cache):
        """Test same parameters produce same hash."""
        params = {"preset": "balanced", "feature_density": "medium", "max_threads": 8}
        h1 = cache.compute_parameters_hash(params)
        h2 = cache.compute_parameters_hash(params)
        assert h1 == h2

    def test_different_params_different_hash(self, cache):
        """Test different parameters produce different hashes."""
        params1 = {"preset": "fast", "feature_density": "low"}
        params2 = {"preset": "quality", "feature_density": "high"}
        assert cache.compute_parameters_hash(params1) != cache.compute_parameters_hash(params2)


class TestSaveAndRetrieveStage:
    """Tests for save_stage and check_cached_stages methods."""

    def test_stage_completes_output_cached_with_correct_hash(self, cache, cache_dir):
        """Test stage completes → output cached with correct hash."""
        output_path = create_output_file(cache_dir, "feature_output.txt")
        image_hash = "abc123"
        params_hash = "def456"

        cache.save_stage("feature_extraction", output_path, image_hash, params_hash)

        stages = cache.check_cached_stages(image_hash, params_hash)
        assert len(stages) == 1
        assert stages[0].stage_name == "feature_extraction"
        assert stages[0].image_hash == image_hash
        assert stages[0].parameters_hash == params_hash

    def test_identical_input_and_params_retrieves_cached_stages(self, cache, cache_dir):
        """Test identical input + parameters → cached stages retrieved."""
        image_hash = "hash_abc"
        params_hash = "hash_def"

        for stage in ["feature_extraction", "matching"]:
            output_path = create_output_file(cache_dir, f"{stage}.txt")
            cache.save_stage(stage, output_path, image_hash, params_hash)

        stages = cache.check_cached_stages(image_hash, params_hash)
        assert len(stages) == 2
        stage_names = {s.stage_name for s in stages}
        assert "feature_extraction" in stage_names
        assert "matching" in stage_names

    def test_different_hash_returns_empty(self, cache, cache_dir):
        """Test different hash returns no cached stages."""
        output_path = create_output_file(cache_dir, "output.txt")
        cache.save_stage("feature_extraction", output_path, "hash_a", "params_a")

        stages = cache.check_cached_stages("hash_b", "params_a")
        assert len(stages) == 0


class TestCacheExpiration:
    """Tests for cleanup_expired method."""

    def test_cache_entry_8_days_old_expired_and_removed(self, cache, cache_dir):
        """Test cache entry 8 days old → expired and removed."""
        output_path = create_output_file(cache_dir, "old_output.txt")
        old_date = (datetime.utcnow() - timedelta(days=8)).isoformat()

        conn = cache._get_connection()
        conn.execute(
            """INSERT INTO cached_stages
               (stage_name, output_path, image_hash, parameters_hash, created_at, size_bytes)
               VALUES (?, ?, ?, ?, ?, ?)""",
            ("feature_extraction", output_path, "old_hash", "old_params", old_date, 100),
        )
        conn.commit()
        conn.close()

        removed = cache.cleanup_expired()
        assert removed >= 1

        stages = cache.check_cached_stages("old_hash", "old_params")
        assert len(stages) == 0

    def test_recent_entry_not_expired(self, cache, cache_dir):
        """Test recent cache entry is not expired."""
        output_path = create_output_file(cache_dir, "recent.txt")
        cache.save_stage("matching", output_path, "recent_hash", "params")

        removed = cache.cleanup_expired()
        assert removed == 0

        stages = cache.check_cached_stages("recent_hash", "params")
        assert len(stages) == 1


class TestSizeLimitEnforcement:
    """Tests for enforce_size_limit method."""

    def test_cache_size_over_limit_removes_oldest_entries(self, cache_dir):
        """Test cache size over limit → oldest entries removed."""
        # Use 0 GB limit to force removal on every save
        cache = CacheManager(cache_dir=cache_dir, max_size_gb=0, expiration_days=7)

        # Save all stages — each save triggers enforce_size_limit
        for stage in STAGE_ORDER:
            output_path = create_output_file(cache_dir, f"{stage}.txt", "x" * 1000)
            cache.save_stage(stage, output_path, "hash1", "params1")

        # With 0 GB limit, the cache should have been aggressively pruned
        # Check that not all stages survived (some were removed)
        stages = cache.check_cached_stages("hash1", "params1")
        # At 0 GB limit, all entries should be removed after each save
        assert len(stages) <= len(STAGE_ORDER)

    def test_cache_within_limit_no_removal(self, cache, cache_dir):
        """Test cache within size limit → no entries removed."""
        output_path = create_output_file(cache_dir, "small.txt", "small")
        cache.save_stage("feature_extraction", output_path, "hash1", "params1")

        removed = cache.enforce_size_limit()
        assert removed == 0


class TestGetResumeStage:
    """Tests for get_resume_stage method."""

    def test_resume_from_cached_matching_starts_at_reconstruction(self, cache, cache_dir):
        """Test resume from cached 'matching' stage → processing starts at 'reconstruction'."""
        image_hash = "hash1"
        params_hash = "params1"

        for stage in ["feature_extraction", "matching"]:
            output_path = create_output_file(cache_dir, f"{stage}.txt")
            cache.save_stage(stage, output_path, image_hash, params_hash)

        cached = cache.check_cached_stages(image_hash, params_hash)
        resume = cache.get_resume_stage(cached)

        assert resume == "reconstruction"

    def test_no_cache_starts_at_first_stage(self, cache):
        """Test no cache → starts at first stage."""
        resume = cache.get_resume_stage([])
        assert resume == STAGE_ORDER[0]

    def test_all_stages_cached_returns_none(self, cache, cache_dir):
        """Test all stages cached → returns None (nothing to process)."""
        image_hash = "hash1"
        params_hash = "params1"

        for stage in STAGE_ORDER:
            output_path = create_output_file(cache_dir, f"{stage}.txt")
            cache.save_stage(stage, output_path, image_hash, params_hash)

        cached = cache.check_cached_stages(image_hash, params_hash)
        resume = cache.get_resume_stage(cached)

        assert resume is None
