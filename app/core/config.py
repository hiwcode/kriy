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
    APP_NAME: str = Field(default="KRIY", description="Application name")
    APP_VERSION: str = Field(default="0.1.0", description="Application version")
    DEBUG: bool = Field(default=False, description="Debug mode")
    ENVIRONMENT: str = Field(
        default="production",
        description="Deployment environment: 'development' or 'production'. "
        "Local-only tools (bash, file access, run_python, claude_code) are "
        "disabled in production. Defaults to 'production' so a forgotten/typo'd "
        "env var fails safe (RCE-class tools stay OFF) — set ENVIRONMENT=development "
        "locally to enable them.",
        env="ENVIRONMENT",
    )

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
    PORT: int = Field(default=8000, description="Server port")
    BACKEND_URL: str = Field(default="http://localhost:8000", description="Backend URL for A2A")
    ENABLE_API_DOCS: bool = Field(
        default=True,
        description="Expose OpenAPI JSON, Swagger UI, and ReDoc. Disable for private deployments if desired.",
        env="ENABLE_API_DOCS",
    )

    # LLM / Google AI
    GOOGLE_API_KEY: str = Field(
        default="",
        description="Google AI (Gemini) API key. Get one at https://aistudio.google.com/app/apikey",
        env="GOOGLE_API_KEY",
    )
    DEFAULT_MODEL: str = Field(
        default="gemini-3.1-flash-lite", description="Default LLM model"
    )

    # Run harness robustness
    LLM_MAX_RETRIES: int = Field(
        default=2,
        description="Extra attempts on a transient LLM error (429/quota/5xx/timeout) that "
        "fails before any output is produced. 0 disables retrying.",
    )
    LLM_RETRY_BASE_DELAY: float = Field(
        default=1.0, description="Base seconds for exponential backoff between LLM retries."
    )
    LLM_MAX_CALLS_PER_RUN: int = Field(
        default=500,
        description="Safety cap on model calls per agent run (ADK RunConfig.max_llm_calls). "
        "Guards against runaway tool loops. <=0 leaves ADK's default.",
    )

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

    # Email safety
    EMAIL_ALLOWED_DOMAINS: str = Field(
        default="",
        description="Comma-separated recipient domain allowlist for the send_email tool "
        "(e.g. 'portpro.io,example.com'). When empty, all recipients are allowed. "
        "When set, the agent can only email addresses in these domains — a guard against "
        "prompt-injection data exfiltration from the owner's account.",
        env="EMAIL_ALLOWED_DOMAINS",
    )

    # Redis
    REDIS_URL: str = Field(default="", description="Redis URL for caching", env="REDIS_URL")

    # Object Storage (DigitalOcean Spaces / S3-compatible)
    SPACES_REGION: str = Field(default="", env="SPACES_REGION")
    SPACES_ACCESS_KEY: str = Field(default="", env="SPACES_ACCESS_KEY")
    SPACES_SECRET_KEY: str = Field(default="", env="SPACES_SECRET_KEY")
    SPACES_BUCKET: str = Field(default="", env="SPACES_BUCKET")
    SPACES_CDN_URL: str = Field(default="", description="CDN/public URL prefix (optional)", env="SPACES_CDN_URL")

    # CORS
    CORS_ORIGINS: list[str] = Field(default=["*"], description="Allowed CORS origins", env="CORS_ORIGINS")
    
    # Logging
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() in ("production", "prod")

    @property
    def local_tools_enabled(self) -> bool:
        """Local-only tools (shell, filesystem, code exec) are off in production."""
        return not self.is_production

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


settings = Settings()

def get_settings() -> Settings:
    return Settings()
