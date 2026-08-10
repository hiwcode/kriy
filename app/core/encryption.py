"""
Symmetric encryption helpers for sensitive data at rest.

Uses Fernet (AES-128-CBC + HMAC-SHA256) from the `cryptography` library.
The key is read from the ENCRYPTION_KEY environment variable (via Settings).

Generate a key once:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Store it in your .env file:
    ENCRYPTION_KEY=<generated-key>
"""

from __future__ import annotations

import logging
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

logger = logging.getLogger(__name__)


class EncryptionError(Exception):
    """Raised when encryption or decryption fails."""


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    """Return a cached Fernet instance from the configured key."""
    key = settings.ENCRYPTION_KEY
    if not key:
        raise EncryptionError(
            "ENCRYPTION_KEY is not set. Generate one with: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as exc:
        raise EncryptionError(f"Invalid ENCRYPTION_KEY: {exc}") from exc


def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext string and return the ciphertext as a URL-safe base64 string."""
    if not plaintext:
        return plaintext
    f = _get_fernet()
    return f.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(ciphertext: str) -> str:
    """Decrypt a Fernet ciphertext string back to plaintext."""
    if not ciphertext:
        return ciphertext
    f = _get_fernet()
    try:
        return f.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        logger.warning("Failed to decrypt value – returning as-is (may be legacy plaintext)")
        return ciphertext


def verify_encryption_key() -> None:
    """Fail fast if ENCRYPTION_KEY is missing or invalid.

    Runs a round-trip self-test (encrypt → decrypt a sentinel). Because `decrypt`
    otherwise swallows failures (to tolerate legacy plaintext), a misconfigured
    key would silently corrupt how secrets round-trip — this surfaces it at boot.
    Raises EncryptionError on any problem.
    """
    sentinel = "kriy-encryption-self-test"
    f = _get_fernet()  # raises EncryptionError if key missing/invalid
    token = f.encrypt(sentinel.encode("utf-8"))
    if f.decrypt(token).decode("utf-8") != sentinel:
        raise EncryptionError("ENCRYPTION_KEY self-test failed (round-trip mismatch).")


def encrypt_or_none(value: str | None) -> str | None:
    """Encrypt if value is not None."""
    return encrypt(value) if value else value


def decrypt_or_none(value: str | None) -> str | None:
    """Decrypt if value is not None."""
    return decrypt(value) if value else value
