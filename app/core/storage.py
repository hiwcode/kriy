"""DigitalOcean Spaces / S3-compatible object storage client.

All documents are stored under the `docs/` prefix.
Falls back gracefully when Spaces is not configured.
"""

from __future__ import annotations

import logging
from typing import BinaryIO

import boto3
from botocore.config import Config as BotoConfig

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None
_DOCS_PREFIX = "docs/"


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not settings.SPACES_REGION or not settings.SPACES_ACCESS_KEY:
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
    return bool(settings.SPACES_REGION and settings.SPACES_ACCESS_KEY and settings.SPACES_BUCKET)


def upload_file(key: str, file: BinaryIO, content_type: str = "application/octet-stream") -> str:
    """Upload a file to Spaces under docs/. Returns the object key."""
    client = _get_client()
    if client is None:
        raise RuntimeError("Spaces storage is not configured")
    full_key = f"{_DOCS_PREFIX}{key}"
    client.upload_fileobj(
        file,
        settings.SPACES_BUCKET,
        full_key,
        ExtraArgs={"ContentType": content_type, "ACL": "private"},
    )
    return full_key


def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    """Generate a presigned download URL (default 1 hour)."""
    client = _get_client()
    if client is None:
        raise RuntimeError("Spaces storage is not configured")
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.SPACES_BUCKET, "Key": key},
        ExpiresIn=expires_in,
    )


def delete_file(key: str) -> None:
    """Delete a file from Spaces."""
    client = _get_client()
    if client is None:
        return
    try:
        client.delete_object(Bucket=settings.SPACES_BUCKET, Key=key)
    except Exception:
        logger.warning("Failed to delete Spaces object: %s", key, exc_info=True)


def download_bytes(key: str) -> bytes:
    """Download a file from Spaces as bytes."""
    client = _get_client()
    if client is None:
        raise RuntimeError("Spaces storage is not configured")
    response = client.get_object(Bucket=settings.SPACES_BUCKET, Key=key)
    return response["Body"].read()
