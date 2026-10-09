from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
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

    google_auth_enabled: bool = False
    google_client_id: str = ""

    cloudinary_cloud_name: str = "vrwgerwd"
    cloudinary_api_key: str = Field(default="", validation_alias=AliasChoices("CLOUDINARY_API_KEY", "key"))
    cloudinary_api_secret: str = Field(default="", validation_alias=AliasChoices("CLOUDINARY_API_SECRET", "secret"))

    resend_api_key: str = Field(default="", validation_alias=AliasChoices("RESEND_API_KEY", "API_KEY"))
    email_from: str = "dave <onboarding@resend.dev>"


@lru_cache
def get_settings() -> Settings:
    return Settings()
