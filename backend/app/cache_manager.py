"""
Cache Manager Component for Meshroom Performance Optimization

Stores and retrieves intermediate reconstruction results to enable job resumption.
"""

import hashlib
import json
import logging
import os
import shutil
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# SQLite database filename within the cache directory
_DB_FILENAME = "cache_metadata.db"

# Stage processing order (used for resume logic)
STAGE_ORDER = [
    "feature_extraction",
    "matching",
    "reconstruction",
    "texturing",
]


@dataclass
class CachedStage:
    """Metadata for a cached Meshroom processing stage."""
    stage_name: str
    output_path: str
    image_hash: str
    parameters_hash: str
    created_at: datetime
    size_bytes: int
    last_accessed: Optional[datetime] = None


class CacheManager:
    """Stores and retrieves intermediate reconstruction results."""

    def __init__(
        self,
        cache_dir: str = None,
        max_size_gb: int = None,
        expiration_days: int = None,
    ):
        self.cache_dir = cache_dir or settings.CACHE_DIR
        self.max_size_gb = max_size_gb if max_size_gb is not None else settings.CACHE_MAX_SIZE_GB
        self.expiration_days = expiration_days if expiration_days is not None else settings.CACHE_EXPIRATION_DAYS

        os.makedirs(self.cache_dir, exist_ok=True)
        self._db_path = os.path.join(self.cache_dir, _DB_FILENAME)
        self._init_db()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def compute_input_hash(self, input_path: str) -> str:
        """
        Computes SHA256 hash of input images.

        For a directory, hashes the sorted list of filenames + file sizes.
        For a single file, hashes its content.

        Args:
            input_path: Path to image directory or single file

        Returns:
            Hex SHA256 hash string
        """
        hasher = hashlib.sha256()

        if os.path.isdir(input_path):
            # Hash filenames + sizes (fast, deterministic)
            entries = sorted(os.listdir(input_path))
            for entry in entries:
                full_path = os.path.join(input_path, entry)
                if os.path.isfile(full_path):
                    stat = os.stat(full_path)
                    hasher.update(entry.encode("utf-8"))
                    hasher.update(str(stat.st_size).encode("utf-8"))
        elif os.path.isfile(input_path):
            with open(input_path, "rb") as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    hasher.update(chunk)
        else:
            hasher.update(input_path.encode("utf-8"))

        return hasher.hexdigest()

    def compute_parameters_hash(self, params) -> str:
        """
        Computes SHA256 hash of parameter configuration.

        Args:
            params: MeshroomParameters dataclass or dict

        Returns:
            Hex SHA256 hash string
        """
        if hasattr(params, "__dict__"):
            params_dict = vars(params)
        elif isinstance(params, dict):
            params_dict = params
        else:
            params_dict = {"value": str(params)}

        # Sort keys for deterministic hashing
        serialized = json.dumps(params_dict, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def check_cached_stages(
        self,
        image_hash: str,
        params_hash: str,
    ) -> List[CachedStage]:
        """
        Returns list of valid cached stages for this input/params combination.

        Args:
            image_hash: Hash of input images
            params_hash: Hash of parameter configuration

        Returns:
            List of CachedStage objects, ordered by stage processing order
        """
        conn = self._get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT stage_name, output_path, image_hash, parameters_hash,
                       created_at, size_bytes, last_accessed
                FROM cached_stages
                WHERE image_hash = ? AND parameters_hash = ?
                ORDER BY created_at ASC
                """,
                (image_hash, params_hash),
            )
            rows = cursor.fetchall()
        finally:
            conn.close()

        stages = []
        for row in rows:
            stage_name, output_path, img_hash, param_hash, created_at_str, size_bytes, last_accessed_str = row

            # Skip if output path no longer exists
            if not os.path.exists(output_path):
                continue

            created_at = datetime.fromisoformat(created_at_str)
            last_accessed = (
                datetime.fromisoformat(last_accessed_str) if last_accessed_str else None
            )

            # Skip expired entries
            if datetime.utcnow() - created_at > timedelta(days=self.expiration_days):
                continue

            stages.append(
                CachedStage(
                    stage_name=stage_name,
                    output_path=output_path,
                    image_hash=img_hash,
                    parameters_hash=param_hash,
                    created_at=created_at,
                    size_bytes=size_bytes,
                    last_accessed=last_accessed,
                )
            )

        # Update last_accessed for returned stages
        if stages:
            self._update_last_accessed(image_hash, params_hash)

        return stages

    def save_stage(
        self,
        stage_name: str,
        output_path: str,
        image_hash: str,
        params_hash: str,
    ) -> None:
        """
        Saves stage output metadata to the cache database.

        Args:
            stage_name: Name of the completed stage
            output_path: Path to the stage output directory/file
            image_hash: Hash of input images
            params_hash: Hash of parameter configuration
        """
        size_bytes = self._get_path_size(output_path)
        now = datetime.utcnow().isoformat()

        conn = self._get_connection()
        try:
            conn.execute(
                """
                INSERT OR REPLACE INTO cached_stages
                    (stage_name, output_path, image_hash, parameters_hash,
                     created_at, size_bytes, last_accessed)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (stage_name, output_path, image_hash, params_hash, now, size_bytes, now),
            )
            conn.commit()
        finally:
            conn.close()

        logger.info(
            "Cached stage '%s' for image_hash=%s (size=%d bytes)",
            stage_name,
            image_hash[:8],
            size_bytes,
        )

        # Enforce size limit after saving
        self.enforce_size_limit()

    def cleanup_expired(self, max_age_days: int = None) -> int:
        """
        Removes cached results older than max_age_days.

        Args:
            max_age_days: Override expiration days (default from settings)

        Returns:
            Number of entries removed
        """
        if max_age_days is None:
            max_age_days = self.expiration_days

        cutoff = (datetime.utcnow() - timedelta(days=max_age_days)).isoformat()

        conn = self._get_connection()
        try:
            cursor = conn.execute(
                "SELECT output_path FROM cached_stages WHERE created_at < ?",
                (cutoff,),
            )
            expired_paths = [row[0] for row in cursor.fetchall()]

            cursor = conn.execute(
                "DELETE FROM cached_stages WHERE created_at < ?",
                (cutoff,),
            )
            removed_count = cursor.rowcount
            conn.commit()
        finally:
            conn.close()

        # Remove output files/directories
        for path in expired_paths:
            self._remove_path(path)

        if removed_count > 0:
            logger.info("Removed %d expired cache entries", removed_count)

        return removed_count

    def enforce_size_limit(self) -> int:
        """
        Removes oldest entries when cache exceeds max_size_gb.

        Returns:
            Number of entries removed
        """
        max_bytes = self.max_size_gb * 1024 * 1024 * 1024

        conn = self._get_connection()
        try:
            cursor = conn.execute(
                "SELECT SUM(size_bytes) FROM cached_stages"
            )
            total_bytes = cursor.fetchone()[0] or 0

            if total_bytes <= max_bytes:
                conn.close()
                return 0

            # Get oldest entries first
            cursor = conn.execute(
                "SELECT id, output_path, size_bytes FROM cached_stages ORDER BY created_at ASC"
            )
            entries = cursor.fetchall()
        finally:
            conn.close()

        removed_count = 0
        for entry_id, output_path, size_bytes in entries:
            if total_bytes <= max_bytes:
                break

            conn = self._get_connection()
            try:
                conn.execute("DELETE FROM cached_stages WHERE id = ?", (entry_id,))
                conn.commit()
            finally:
                conn.close()

            self._remove_path(output_path)
            total_bytes -= size_bytes
            removed_count += 1

        if removed_count > 0:
            logger.info(
                "Removed %d cache entries to enforce %d GB size limit",
                removed_count,
                self.max_size_gb,
            )

        return removed_count

    def get_resume_stage(self, cached_stages: List[CachedStage]) -> Optional[str]:
        """
        Returns the name of the next stage to process given cached stages.

        Args:
            cached_stages: List of CachedStage objects from check_cached_stages()

        Returns:
            Name of the next stage to run, or None if all stages are cached
        """
        if not cached_stages:
            return STAGE_ORDER[0] if STAGE_ORDER else None

        cached_names = {s.stage_name for s in cached_stages}

        for i, stage in enumerate(STAGE_ORDER):
            if stage not in cached_names:
                return stage

        return None  # All stages cached

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        """Initialize the SQLite database schema."""
        conn = self._get_connection()
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS cached_stages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stage_name TEXT NOT NULL,
                    output_path TEXT NOT NULL,
                    image_hash TEXT NOT NULL,
                    parameters_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL DEFAULT 0,
                    last_accessed TEXT,
                    UNIQUE(image_hash, parameters_hash, stage_name)
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_hash ON cached_stages (image_hash, parameters_hash)"
            )
            conn.commit()
        finally:
            conn.close()

    def _get_connection(self) -> sqlite3.Connection:
        """Get a SQLite connection to the cache database."""
        return sqlite3.connect(self._db_path)

    def _get_path_size(self, path: str) -> int:
        """Get total size of a file or directory in bytes."""
        if not os.path.exists(path):
            return 0
        if os.path.isfile(path):
            return os.path.getsize(path)
        total = 0
        for dirpath, _, filenames in os.walk(path):
            for fname in filenames:
                fpath = os.path.join(dirpath, fname)
                try:
                    total += os.path.getsize(fpath)
                except OSError:
                    pass
        return total

    def _remove_path(self, path: str) -> None:
        """Remove a file or directory."""
        try:
            if os.path.isdir(path):
                shutil.rmtree(path, ignore_errors=True)
            elif os.path.isfile(path):
                os.remove(path)
        except Exception as exc:
            logger.debug("Failed to remove cache path %s: %s", path, exc)

    def _update_last_accessed(self, image_hash: str, params_hash: str) -> None:
        """Update last_accessed timestamp for all matching entries."""
        now = datetime.utcnow().isoformat()
        conn = self._get_connection()
        try:
            conn.execute(
                "UPDATE cached_stages SET last_accessed = ? WHERE image_hash = ? AND parameters_hash = ?",
                (now, image_hash, params_hash),
            )
            conn.commit()
        finally:
            conn.close()
