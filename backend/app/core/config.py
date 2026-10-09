from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The .env file next to app/ (the backend folder), wherever the server is started from.
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """All configuration comes from environment variables (or a .env file)."""

    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    database_url: str
    jwt_secret: str = Field(min_length=32)
    access_token_expire_minutes: int = 60
    frontend_base_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
    # Optional. Also allow origins matching this regex, e.g. Vercel preview deployments:
    #   https://hiredesk-frontend-.*\.vercel\.app
    cors_origin_regex: str | None = None

    google_auth_enabled: bool = False
    google_client_id: str = ""

    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    resend_api_key: str = ""
    email_from: str = "HireDesk <onboarding@resend.dev>"

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, url: str) -> str:
        """Hosted Postgres (Neon on Vercel) hands out postgres:// URLs; SQLAlchemy needs the psycopg 3 driver."""
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url.removeprefix(prefix)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()