"""Helpers for validating uploaded attachment MIME types.

Clients derive the MIME type they send in different ways -- the browser's own
extension mapping, magic-byte sniffing, or a server-side guess -- and those
sources disagree on capitalisation (``macroEnabled`` vs ``macroenabled``) and on
whether a charset parameter is appended (``text/csv; charset=utf-8``). Comparing
the raw string against the allowlist rejected legitimate files, so normalise
first and compare case-insensitively.
"""

import logging

from django.conf import settings

logger = logging.getLogger("plane.api")


def normalize_mime_type(mime_type):
    """Strip any parameters (``; charset=...``) and case from a MIME type."""
    if not mime_type or not isinstance(mime_type, str):
        return ""
    return mime_type.split(";")[0].strip().lower()


def is_allowed_attachment_mime(mime_type):
    """Return True when the MIME type is on the attachment allowlist."""
    normalized = normalize_mime_type(mime_type)
    if not normalized:
        return False
    return normalized in {allowed.lower() for allowed in settings.ATTACHMENT_MIME_TYPES}


def invalid_attachment_type_error(mime_type):
    """Build a 400 payload that names the rejected type.

    The previous message was a bare "Invalid file type.", which gave neither the
    user nor the logs any way to tell which type was refused.
    """
    normalized = normalize_mime_type(mime_type)
    return {
        "error": (
            f"Invalid file type: {normalized}."
            if normalized
            else "Invalid file type: the file type could not be determined."
        ),
        "file_type": normalized,
        "status": False,
    }


def log_attachment_type_rejection(name, mime_type):
    """Record which file and type were refused.

    A rejected upload used to leave nothing but a 400 in the access log, so there
    was no way to tell afterwards which MIME type the client had sent.
    """
    logger.warning(
        "Attachment rejected: unsupported MIME type",
        extra={"file_name": name, "file_type": normalize_mime_type(mime_type) or "<empty>"},
    )
