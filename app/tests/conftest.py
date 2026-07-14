"""Shared test setup.

Set safe env defaults BEFORE any app module imports (settings reads env at import
time). These only fill gaps — real values (e.g. DATABASE_URL in CI) take precedence.
"""

import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")  # obvious placeholder, not a real secret

# Generate a valid throwaway Fernet key at runtime (never commit a key literal).
if "ENCRYPTION_KEY" not in os.environ:
    from cryptography.fernet import Fernet

    os.environ["ENCRYPTION_KEY"] = Fernet.generate_key().decode()
