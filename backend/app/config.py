"""Application settings loaded from environment variables and the repo-root .env."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "EngiMentor"
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://engimentor:change-me@localhost:5433/engimentor"
    storage_dir: Path = REPO_ROOT / "storage"
    max_upload_mb: int = 50


@lru_cache
def get_settings() -> Settings:
    return Settings()
