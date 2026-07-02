"""
Application settings with environment variable support.

Usage:    
    print(settings.APP_NAME)
    print(settings.DATABASE_URL)
"""

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # Application
    APP_NAME: str = Field(default="Atelier", description="Application name")
    APP_VERSION: str = Field(default="0.1.0", description="Application version")
    DEBUG: bool = Field(default=False, description="Debug mode")

    # API
    API_KEYS: str = Field(default="", description="Comma-separated valid API keys", env="API_KEYS")
    GOOGLE_CLIENT_ID: str = Field(
        default="",
        description="Google OAuth client ID for token validation (from Google Cloud Console)",
        env="GOOGLE_CLIENT_ID",
    )
    DATABASE_URL: str = Field(default="", description="Database URL", env="DATABASE_URL")

    # Server
    HOST: str = Field(default="0.0.0.0", description="Server host")
    PORT: int = Field(default=8001, description="Server port")
    BACKEND_URL: str = Field(default="http://localhost:8000", description="Backend URL for A2A")

    # LLM / Google AI
    GOOGLE_API_KEY: str = Field(
        default="",
        description="Google AI (Gemini) API key. Get one at https://aistudio.google.com/app/apikey",
        env="GOOGLE_API_KEY",
    )
    DEFAULT_MODEL: str = Field(default="gemini-2.0-flash", description="Default LLM model")

    # Tokenizer
    TOKENIZER_MODEL: str = Field(
        default="gpt-4o-mini", description="OpenAI model for tokenization"
    )
    TOKENIZER_ENCODING: str = Field(
        default="o200k_base", description="OpenAI tokenizer encoding fallback"
    )
    
    # Encryption
    ENCRYPTION_KEY: str = Field(
        default="",
        description="Fernet encryption key for sensitive data at rest. Generate with: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'",
        env="ENCRYPTION_KEY",
    )

    # Session tokens (backend-issued access JWT + refresh)
    JWT_SECRET: str = Field(
        default="",
        description="Secret for signing session access tokens (falls back to ENCRYPTION_KEY if unset)",
        env="JWT_SECRET",
    )
    ACCESS_TOKEN_TTL_MINUTES: int = Field(default=1440, description="Access token lifetime (minutes)")
    REFRESH_TOKEN_TTL_DAYS: int = Field(default=30, description="Refresh token lifetime (days)")

    # CORS
    CORS_ORIGINS: list[str] = Field(default=["*"], description="Allowed CORS origins", env="CORS_ORIGINS")
    
    # Logging
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


settings = Settings()

def get_settings() -> Settings:
    return Settings()
