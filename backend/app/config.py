"""Application settings loaded from environment variables and the repo-root .env."""

from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "VIFE"
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://engimentor:change-me@localhost:5433/engimentor"
    storage_dir: Path = REPO_ROOT / "storage"
    max_upload_mb: int = 50
    # "fake" (offline, deterministic) or "openai_compatible" (Ollama, Groq, Gemini, OpenRouter: ADR 0005)
    llm_provider: str = "fake"
    llm_base_url: str = "http://localhost:11434/v1"  # local Ollama
    llm_model: str = "qwen2.5-coder:7b"
    llm_api_key: SecretStr = SecretStr("")  # not needed for Ollama; never logged
    llm_timeout_seconds: float = 180.0

    # Accounts
    session_days: int = 14
    password_reset_minutes: int = 30
    # Public URL of the frontend, used to build password-reset links.
    app_url: str = "http://localhost:5173"
    # "console" logs reset links to the API console; a real email provider needs approval first.
    email_backend: str = "console"

    @property
    def cookie_secure(self) -> bool:
        """Session cookies are HTTPS-only everywhere except local development."""
        return self.app_env != "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
