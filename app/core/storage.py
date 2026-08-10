"""Object storage for uploaded documents (stored under the `docs/` prefix).

Two backends:
- **DigitalOcean Spaces / S3** when SPACES_* is configured (prod).
- **Local disk** dev fallback (under ./bucket, override with KRIY_STORAGE_DIR)
  when Spaces is not configured and not running in production — so you can test
  uploads without any S3 setup. Presigned URLs become signed local URLs served
  by /api/v1/documents/local/{key}.
"""

from __future__ import annotations

import logging
import os
import pathlib
import shutil
from typing import BinaryIO

import boto3
from botocore.config import Config as BotoConfig

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None
_DOCS_PREFIX = "docs/"

_PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
_LOCAL_DIR = pathlib.Path(os.getenv("KRIY_STORAGE_DIR") or (_PROJECT_ROOT / "bucket"))


def _spaces_configured() -> bool:
    return bool(settings.SPACES_REGION and settings.SPACES_ACCESS_KEY and settings.SPACES_BUCKET)


def _use_local() -> bool:
    """Local-disk storage: dev fallback when Spaces isn't configured."""
    return not _spaces_configured() and not settings.is_production


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not _spaces_configured():
        return None
    _client = boto3.client(
        "s3",
        endpoint_url=f"https://{settings.SPACES_REGION}.digitaloceanspaces.com",
        aws_access_key_id=settings.SPACES_ACCESS_KEY,
        aws_secret_access_key=settings.SPACES_SECRET_KEY,
        config=BotoConfig(signature_version="s3v4"),
        region_name=settings.SPACES_REGION,
    )
    return _client


def is_configured() -> bool:
    """True when uploads can be stored — Spaces OR the local dev fallback."""
    return _spaces_configured() or _use_local()


def _local_path(full_key: str) -> pathlib.Path:
    """Resolve a storage key to a path under _LOCAL_DIR, blocking traversal."""
    root = _LOCAL_DIR.resolve()
    path = (root / full_key).resolve()
    if not str(path).startswith(str(root)):
        raise RuntimeError("invalid storage key")
    return path


def upload_file(key: str, file: BinaryIO, content_type: str = "application/octet-stream") -> str:
    """Store a file under docs/. Returns the object key (used as bucket_key)."""
    full_key = f"{_DOCS_PREFIX}{key}"
    if _spaces_configured():
        _get_client().upload_fileobj(
            file,
            settings.SPACES_BUCKET,
            full_key,
            ExtraArgs={"ContentType": content_type, "ACL": "private"},
        )
        return full_key
    if _use_local():
        path = _local_path(full_key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as out:
            shutil.copyfileobj(file, out)
        logger.info("Stored upload on local disk (dev): %s", path)
        return full_key
    raise RuntimeError("Storage is not configured")


def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    """A presigned download URL (Spaces), or a signed local URL in dev."""
    if _spaces_configured():
        return _get_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.SPACES_BUCKET, "Key": key},
            ExpiresIn=expires_in,
        )
    if _use_local():
        from app.core import workspace_signing
        return f"/api/v1/documents/local/{key}?sig={workspace_signing.sign_path(key)}"
    raise RuntimeError("Storage is not configured")


def delete_file(key: str) -> None:
    """Delete a stored file."""
    if _spaces_configured():
        try:
            _get_client().delete_object(Bucket=settings.SPACES_BUCKET, Key=key)
        except Exception:
            logger.warning("Failed to delete Spaces object: %s", key, exc_info=True)
        return
    if _use_local():
        try:
            _local_path(key).unlink(missing_ok=True)
        except Exception:
            logger.warning("Failed to delete local object: %s", key, exc_info=True)
        return


def download_bytes(key: str) -> bytes:
    """Read a stored file as bytes."""
    if _spaces_configured():
        response = _get_client().get_object(Bucket=settings.SPACES_BUCKET, Key=key)
        return response["Body"].read()
    if _use_local():
        return _local_path(key).read_bytes()
    raise RuntimeError("Storage is not configured")
