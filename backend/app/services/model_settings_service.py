"""Model-provider settings with encrypted-at-rest user API keys."""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.book import ModelProviderSetting


def _fernet() -> Fernet:
    # A dedicated APP_ENCRYPTION_KEY is required for a production installation.
    # The local fallback still keeps the key out of the database in clear text.
    material = settings.app_encryption_key or settings.database_url
    key = base64.urlsafe_b64encode(hashlib.sha256(material.encode("utf-8")).digest())
    return Fernet(key)


def _record(db: Session) -> ModelProviderSetting | None:
    return db.scalar(select(ModelProviderSetting).where(ModelProviderSetting.id == 1))


def _decrypt(value: str | None) -> str:
    if not value:
        return ""
    try:
        return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return ""


def resolve_model_config(db: Session) -> tuple[str, str, str, str]:
    record = _record(db)
    key = _decrypt(record.api_key_encrypted) if record else ""
    if key:
        return key, record.base_url or settings.deepseek_base_url, record.model or settings.deepseek_model, "database"
    if settings.deepseek_api_key:
        return settings.deepseek_api_key, record.base_url if record and record.base_url else settings.deepseek_base_url, record.model if record and record.model else settings.deepseek_model, "environment"
    return "", record.base_url if record and record.base_url else settings.deepseek_base_url, record.model if record and record.model else settings.deepseek_model, "none"


def masked_key(key: str) -> str | None:
    if not key:
        return None
    suffix = key[-4:] if len(key) >= 4 else key
    return f"••••••••{suffix}"


def public_model_settings(db: Session) -> dict:
    key, base_url, model, source = resolve_model_config(db)
    return {
        "provider": "deepseek",
        "base_url": base_url,
        "model": model,
        "has_api_key": bool(key),
        "api_key_masked": masked_key(key),
        "key_source": source,
        "encryption_mode": "app_secret" if settings.app_encryption_key else "local_fallback",
    }


def save_model_settings(db: Session, *, api_key: str | None, clear_api_key: bool, base_url: str, model: str) -> dict:
    record = _record(db)
    if not record:
        record = ModelProviderSetting(id=1)
        db.add(record)
    record.base_url = base_url.rstrip("/")
    record.model = model.strip()
    if clear_api_key:
        record.api_key_encrypted = None
    elif api_key:
        record.api_key_encrypted = _fernet().encrypt(api_key.encode("utf-8")).decode("utf-8")
    db.commit()
    return public_model_settings(db)
