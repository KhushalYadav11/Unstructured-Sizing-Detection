"""
Error Handler Component for Meshroom Performance Optimization

Categorizes errors, determines retry eligibility, and provides actionable diagnostics.
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# Error type constants
ERROR_VALIDATION = "validation_failed"
ERROR_INSUFFICIENT_IMAGES = "insufficient_images"
ERROR_POOR_QUALITY = "poor_image_quality"
ERROR_GPU_FAILURE = "gpu_failure"
ERROR_TIMEOUT = "timeout"
ERROR_DISK_SPACE = "disk_space"
ERROR_INSUFFICIENT_FEATURES = "insufficient_features"
ERROR_PROCESSING = "processing_error"
ERROR_SYSTEM = "system_error"
ERROR_UNKNOWN = "unknown_error"

# Errors that can be retried
RETRYABLE_ERRORS = {
    ERROR_GPU_FAILURE,
    ERROR_TIMEOUT,
    ERROR_INSUFFICIENT_FEATURES,
    ERROR_PROCESSING,
}

# Errors that are permanent (no retry)
PERMANENT_ERRORS = {
    ERROR_VALIDATION,
    ERROR_INSUFFICIENT_IMAGES,
    ERROR_POOR_QUALITY,
    ERROR_DISK_SPACE,
}

# Remediation messages for each error type
REMEDIATION_MESSAGES: Dict[str, str] = {
    ERROR_VALIDATION: "Fix input validation errors before resubmitting.",
    ERROR_INSUFFICIENT_IMAGES: "Provide at least 8 images with sufficient overlap.",
    ERROR_POOR_QUALITY: "Use sharper images with better lighting and overlap.",
    ERROR_GPU_FAILURE: "GPU processing failed. Retrying with CPU fallback.",
    ERROR_TIMEOUT: "Processing timed out. Retrying with reduced quality settings.",
    ERROR_DISK_SPACE: "Insufficient disk space. Free up space and resubmit.",
    ERROR_INSUFFICIENT_FEATURES: "Insufficient image features detected. Retrying with higher sensitivity.",
    ERROR_PROCESSING: "Processing error occurred. Retrying with adjusted parameters.",
    ERROR_SYSTEM: "System error occurred. Check system resources and retry.",
    ERROR_UNKNOWN: "An unknown error occurred. Check logs for details.",
}

# Patterns to detect error types from Meshroom output
_ERROR_PATTERNS = [
    (re.compile(r"insufficient.*image|too few.*image|not enough.*image", re.IGNORECASE), ERROR_INSUFFICIENT_IMAGES),
    (re.compile(r"blur|sharp|quality|focus", re.IGNORECASE), ERROR_POOR_QUALITY),
    (re.compile(r"cuda|gpu|nvml|device.*error|out of memory", re.IGNORECASE), ERROR_GPU_FAILURE),
    (re.compile(r"timeout|timed out|time limit", re.IGNORECASE), ERROR_TIMEOUT),
    (re.compile(r"disk.*full|no space|storage.*full|ENOSPC", re.IGNORECASE), ERROR_DISK_SPACE),
    (re.compile(r"insufficient.*feature|no.*feature|feature.*match.*fail", re.IGNORECASE), ERROR_INSUFFICIENT_FEATURES),
    (re.compile(r"validation.*fail|invalid.*input", re.IGNORECASE), ERROR_VALIDATION),
]


@dataclass
class ErrorDiagnostics:
    """Comprehensive error diagnostics for a failed job."""
    failure_type: str
    error_message: str
    remediation: str
    is_retryable: bool
    retry_count: int = 0
    max_retries: int = 2
    input_characteristics: Dict[str, Any] = field(default_factory=dict)
    parameters_used: Dict[str, Any] = field(default_factory=dict)
    system_resources: Dict[str, Any] = field(default_factory=dict)
    raw_error_output: str = ""


class ErrorHandler:
    """Categorizes errors and provides actionable diagnostics."""

    def __init__(self):
        self._max_retries = settings.MAX_RETRY_ATTEMPTS
        self._retry_delay = settings.RETRY_DELAY_SECONDS

    def categorize_error(self, error_output: str, exception: Optional[Exception] = None) -> str:
        """
        Categorizes a Meshroom error into a known error type.

        Args:
            error_output: Meshroom stdout/stderr output
            exception: Optional Python exception

        Returns:
            Error type string (one of the ERROR_* constants)
        """
        combined = error_output or ""
        if exception:
            combined += f"\n{type(exception).__name__}: {str(exception)}"

        for pattern, error_type in _ERROR_PATTERNS:
            if pattern.search(combined):
                return error_type

        return ERROR_UNKNOWN

    def should_retry(self, failure_type: str, retry_count: int) -> bool:
        """
        Determines if a failed job should be retried.

        Args:
            failure_type: Error type from categorize_error()
            retry_count: Number of retries already attempted

        Returns:
            True if the job should be retried
        """
        if failure_type in PERMANENT_ERRORS:
            return False
        if retry_count >= self._max_retries:
            return False
        return failure_type in RETRYABLE_ERRORS

    def build_diagnostics(
        self,
        failure_type: str,
        error_message: str,
        retry_count: int = 0,
        input_characteristics: Optional[Dict[str, Any]] = None,
        parameters_used: Optional[Dict[str, Any]] = None,
        system_resources: Optional[Dict[str, Any]] = None,
        raw_error_output: str = "",
    ) -> ErrorDiagnostics:
        """
        Builds comprehensive error diagnostics.

        Args:
            failure_type: Error type from categorize_error()
            error_message: Human-readable error message
            retry_count: Number of retries already attempted
            input_characteristics: Dict of input analysis results
            parameters_used: Dict of Meshroom parameters used
            system_resources: Dict of system resource state
            raw_error_output: Raw Meshroom error output

        Returns:
            ErrorDiagnostics with all diagnostic information
        """
        remediation = REMEDIATION_MESSAGES.get(failure_type, REMEDIATION_MESSAGES[ERROR_UNKNOWN])
        is_retryable = self.should_retry(failure_type, retry_count)

        return ErrorDiagnostics(
            failure_type=failure_type,
            error_message=error_message,
            remediation=remediation,
            is_retryable=is_retryable,
            retry_count=retry_count,
            max_retries=self._max_retries,
            input_characteristics=input_characteristics or {},
            parameters_used=parameters_used or {},
            system_resources=system_resources or {},
            raw_error_output=raw_error_output,
        )

    def get_remediation_message(self, failure_type: str) -> str:
        """
        Returns an actionable remediation message for a given failure type.

        Args:
            failure_type: Error type string

        Returns:
            Human-readable remediation message
        """
        return REMEDIATION_MESSAGES.get(failure_type, REMEDIATION_MESSAGES[ERROR_UNKNOWN])

    def adjust_parameters_for_retry(
        self,
        params: Dict[str, Any],
        failure_type: str,
    ) -> Dict[str, Any]:
        """
        Adjusts parameters based on failure type for retry.

        Args:
            params: Current parameters dict
            failure_type: Error type from categorize_error()

        Returns:
            Adjusted parameters dict
        """
        adjusted = dict(params)

        if failure_type == ERROR_TIMEOUT:
            adjusted["downscale_factor"] = 2
            adjusted["feature_density"] = "medium"
            adjusted["mesh_quality"] = "medium"
            adjusted["preset"] = "fast"

        elif failure_type == ERROR_INSUFFICIENT_FEATURES:
            density_order = ["low", "medium", "high", "ultra"]
            current = adjusted.get("feature_density", "medium")
            if current in density_order:
                idx = density_order.index(current)
                if idx < len(density_order) - 1:
                    adjusted["feature_density"] = density_order[idx + 1]

        elif failure_type == ERROR_GPU_FAILURE:
            adjusted["use_gpu"] = False
            adjusted["max_threads"] = min(adjusted.get("max_threads", 8), 4)

        return adjusted
