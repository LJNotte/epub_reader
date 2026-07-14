from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://reader:change-me@localhost:5432/epub_reader"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"
    # Used to encrypt a user-entered model key before it is persisted in PostgreSQL.
    # Production deployments must set this to a dedicated, high-entropy secret.
    app_encryption_key: str = ""
    # Keep a single question predictable in both latency and API cost.
    deepseek_max_output_tokens: int = 800
    ai_max_question_characters: int = 1000
    ai_max_selected_characters: int = 2000
    ai_max_context_characters: int = 4000
    ai_context_chunk_limit: int = 5
    ai_max_turns_per_thread: int = 8
    upload_dir: Path = Path("uploads")
    tts_cache_dir: Path = Path("tts_cache")
    tts_provider: str = "edge"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [value.strip() for value in self.cors_origins.split(",") if value.strip()]


settings = Settings()
