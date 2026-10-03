from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = ""
    tiger_database_url: str = ""
    spacetime_host: str = "https://maincloud.spacetimedb.com"
    spacetime_db: str = "pulse-live-t8ng8"
    spacetime_token: str = ""
    spacetime_admin_views: bool = False  # True when the token is an admin, not the owner
    internal_token: str = "dev-internal-token"
    gateway_url: str = ""
    gateway_secret: str = "dev-gateway-secret"
    secret_key: str = ""
    gemini_api_key: str = ""
    gemini_model_fast: str = "gemini-3.5-flash-lite"
    gemini_model_smart: str = "gemini-3.8-flash"
    llm_fake: bool = False
    fitbit_client_id: str = ""
    fitbit_client_secret: str = ""
    fitbit_subscriber_verify_code: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""
    finchnode_api_key: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""
    agent_seed: str = ""
    public_web_url: str = "http://localhost:3000"
    public_agent_url: str = "http://localhost:8000"
    photon_number_display: str = ""
    scheduler_enabled: bool = True


@lru_cache
def settings() -> Settings:
    return Settings()
