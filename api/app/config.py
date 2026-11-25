"""App settings, read from environment variables (or a local .env file).

Nothing secret lives in the code: the database URL, Redis URL and JWT secret come from the
environment, so the same code runs on a laptop, in Docker and on Render.
"""

import os
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-secret-change-me-in-production-0000"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # SQLite needs no setup for local development; Docker and production use PostgreSQL.
    database_url: str = "sqlite:///./nexusflow.db"
    # Empty means "use the in-process cache" (fine for one API instance and for tests).
    redis_url: str | None = None

    jwt_secret: str = Field(DEV_JWT_SECRET, min_length=32)
    # Access tokens are short-lived and kept only in the browser's memory. The long-lived refresh
    # token lives in an httpOnly cookie that JavaScript can't read.
    access_token_minutes: int = Field(15, ge=1, le=60)
    refresh_token_days: int = Field(7, ge=1, le=30)
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    cors_origins: str = "http://localhost:5173,http://localhost:8080"
    login_attempts_per_minute: int = Field(10, ge=1)
    stats_cache_seconds: int = Field(60, ge=1)
    max_upload_bytes: int = Field(2_000_000, ge=1_000)

    @model_validator(mode="after")
    def refuse_dev_secret_in_production(self) -> Settings:
        # Render sets RENDER=true on every service. Anyone who knows the public default secret
        # could sign their own tokens, so refuse to start with it there.
        if os.environ.get("RENDER") and self.jwt_secret == DEV_JWT_SECRET:
            raise ValueError("JWT_SECRET must be set to a long random value in production")
        return self

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, url: str) -> str:
        # Neon and Render hand out "postgresql://..." or "postgres://...". SQLAlchemy needs to be
        # told which driver to use, so rewrite those to the psycopg (v3) driver.
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix) :]
        return url

    @field_validator("redis_url")
    @classmethod
    def empty_means_none(cls, url: str | None) -> str | None:
        return url or None

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
