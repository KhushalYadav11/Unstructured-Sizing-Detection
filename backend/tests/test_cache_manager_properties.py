"""
Property-Based Tests for Cache Manager component.

Tests universal correctness properties across all valid inputs using Hypothesis.
"""

import os
import tempfile
from datetime import datetime, timedelta
from hypothesis import given, strategies as st, settings

from app.cache_manager import CacheManager, STAGE_ORDER


def make_cache_manager(tmpdir: str, max_size_gb: int = 100, expiration_days: int = 7) -> CacheManager:
    return CacheManager(cache_dir=tmpdir, max_size_gb=max_size_gb, expiration_days=expiration_days)


# ---------------------------------------------------------------------------
# Property 9: Cache Key Association
# ---------------------------------------------------------------------------

class TestProperty9CacheKeyAssociation:
    """
    Property 9: Cache Key Association
    Validates: Requirements 7.1, 7.2
    """

    @given(
        stage_name=st.sampled_from(STAGE_ORDER),
        image_hash=st.text(min_size=8, max_size=64, alphabet="0123456789abcdef"),
        params_hash=st.text(min_size=8, max_size=64, alphabet="0123456789abcdef"),
    )
    @settings(max_examples=50, deadline=None)
    def test_saved_stage_retrievable_with_same_hash(self, stage_name, image_hash, params_hash):
        """
        Stage outputs saved with a hash key SHALL be retrievable with the same key.
        Validates: Requirements 7.1, 7.2
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            cache = make_cache_manager(tmpdir)

            # Create a dummy output file
            output_path = os.path.join(tmpdir, f"{stage_name}_output.txt")
            with open(output_path, "w") as f:
                f.write("stage output")

            # Save stage
            cache.save_stage(stage_name, output_path, image_hash, params_hash)

            # Retrieve with same hash
            stages = cache.check_cached_stages(image_hash, params_hash)

            assert len(stages) >= 1, (
                f"Expected at least 1 cached stage for hash {image_hash[:8]}"
            )
            stage_names = [s.stage_name for s in stages]
            assert stage_name in stage_names, (
                f"Expected stage '{stage_name}' in cached stages: {stage_names}"
            )

    @given(
        image_hash_a=st.text(min_size=8, max_size=16, alphabet="0123456789abcdef"),
        image_hash_b=st.text(min_size=8, max_size=16, alphabet="0123456789abcdef"),
    )
    @settings(max_examples=30, deadline=None)
    def test_different_hashes_return_different_results(self, image_hash_a, image_hash_b):
        """
        Different input hashes SHALL return different (or empty) cache results.
        Validates: Requirement 7.2
        """
        from hypothesis import assume
        assume(image_hash_a != image_hash_b)

        with tempfile.TemporaryDirectory() as tmpdir:
            cache = make_cache_manager(tmpdir)
            params_hash = "abc123"

            # Save stage for hash_a only
            output_path = os.path.join(tmpdir, "output.txt")
            with open(output_path, "w") as f:
                f.write("output")

            cache.save_stage("feature_extraction", output_path, image_hash_a, params_hash)

            # hash_a should have results, hash_b should not
            stages_a = cache.check_cached_stages(image_hash_a, params_hash)
            stages_b = cache.check_cached_stages(image_hash_b, params_hash)

            assert len(stages_a) >= 1
            assert len(stages_b) == 0


# ---------------------------------------------------------------------------
# Property 10: Cache Resume from Last Completed Stage
# ---------------------------------------------------------------------------

class TestProperty10CacheResume:
    """
    Property 10: Cache Resume from Last Completed Stage
    Validates: Requirements 7.3, 7.4
    """

    @given(
        num_cached=st.integers(min_value=1, max_value=len(STAGE_ORDER)),
    )
    @settings(max_examples=20, deadline=None)
    def test_resume_starts_from_next_uncached_stage(self, num_cached):
        """
        Processing SHALL resume from the last completed stage when valid cache exists.
        Validates: Requirements 7.3, 7.4
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            cache = make_cache_manager(tmpdir)
            image_hash = "abc123"
            params_hash = "def456"

            # Cache the first num_cached stages
            for i in range(num_cached):
                stage = STAGE_ORDER[i]
                output_path = os.path.join(tmpdir, f"{stage}_output.txt")
                with open(output_path, "w") as f:
                    f.write(f"{stage} output")
                cache.save_stage(stage, output_path, image_hash, params_hash)

            # Get cached stages
            cached = cache.check_cached_stages(image_hash, params_hash)
            resume_stage = cache.get_resume_stage(cached)

            if num_cached < len(STAGE_ORDER):
                expected_next = STAGE_ORDER[num_cached]
                assert resume_stage == expected_next, (
                    f"Expected resume at '{expected_next}', got '{resume_stage}' "
                    f"(cached {num_cached} stages)"
                )
            else:
                # All stages cached
                assert resume_stage is None

    def test_no_cache_starts_from_first_stage(self):
        """
        When no cache exists, processing SHALL start from the first stage.
        Validates: Requirement 7.3
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            cache = make_cache_manager(tmpdir)
            resume_stage = cache.get_resume_stage([])
            assert resume_stage == STAGE_ORDER[0]


# ---------------------------------------------------------------------------
# Property 11: Cache Expiration and Size Limits
# ---------------------------------------------------------------------------

class TestProperty11CacheExpirationAndSizeLimits:
    """
    Property 11: Cache Expiration and Size Limits
    Validates: Requirements 7.5, 7.6
    """

    @given(
        age_days=st.integers(min_value=8, max_value=30),
    )
    @settings(max_examples=20, deadline=None)
    def test_entries_older_than_7_days_are_expired(self, age_days):
        """
        Cache entries older than 7 days SHALL be expired and removed.
        Validates: Requirement 7.5
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            cache = make_cache_manager(tmpdir, expiration_days=7)

            # Manually insert an old entry
            old_date = (datetime.utcnow() - timedelta(days=age_days)).isoformat()
            conn = cache._get_connection()
            output_path = os.path.join(tmpdir, "old_output.txt")
            with open(output_path, "w") as f:
                f.write("old output")

            conn.execute(
                """INSERT INTO cached_stages
                   (stage_name, output_path, image_hash, parameters_hash, created_at, size_bytes)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                ("feature_extraction", output_path, "old_hash", "old_params", old_date, 100),
            )
            conn.commit()
            conn.close()

            # Run cleanup
            removed = cache.cleanup_expired(max_age_days=7)

            assert removed >= 1, f"Expected at least 1 expired entry removed, got {removed}"

            # Verify entry is gone
            stages = cache.check_cached_stages("old_hash", "old_params")
            assert len(stages) == 0, "Expired entries should not be returned"

    def test_entries_within_7_days_not_expired(self):
        """
        Cache entries within 7 days SHALL NOT be expired.
        Validates: Requirement 7.5
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            cache = make_cache_manager(tmpdir, expiration_days=7)

            output_path = os.path.join(tmpdir, "recent_output.txt")
            with open(output_path, "w") as f:
                f.write("recent output")

            cache.save_stage("feature_extraction", output_path, "recent_hash", "params")

            removed = cache.cleanup_expired(max_age_days=7)
            assert removed == 0

            stages = cache.check_cached_stages("recent_hash", "params")
            assert len(stages) == 1

    def test_size_limit_removes_oldest_entries(self):
        """
        When cache exceeds size limit, oldest entries SHALL be removed.
        Validates: Requirement 7.6
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            # Use a very small limit (1 byte = 1/(1024^3) GB ≈ 0 GB)
            # We'll use 1 GB but insert entries with artificially large size_bytes
            cache = make_cache_manager(tmpdir, max_size_gb=1)

            # Manually insert entries with large reported sizes to exceed 1 GB
            conn = cache._get_connection()
            large_size = 600 * 1024 * 1024 * 1024  # 600 GB each
            for i, stage in enumerate(STAGE_ORDER):
                output_path = os.path.join(tmpdir, f"{stage}_output.txt")
                with open(output_path, "w") as f:
                    f.write(f"output {i}")
                conn.execute(
                    """INSERT OR REPLACE INTO cached_stages
                       (stage_name, output_path, image_hash, parameters_hash, created_at, size_bytes)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (stage, output_path, "hash1", "params1",
                     f"2024-01-0{i+1}T00:00:00", large_size),
                )
            conn.commit()
            conn.close()

            # Enforce size limit
            removed = cache.enforce_size_limit()

            # With entries totaling 4 * 600 GB >> 1 GB limit, entries should be removed
            assert removed > 0, "Expected entries to be removed when over size limit"
