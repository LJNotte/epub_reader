from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.services.model_settings_service import public_model_settings, save_model_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


class ModelSettingsPayload(BaseModel):
    api_key: str | None = Field(default=None, max_length=500)
    clear_api_key: bool = False
    base_url: str = Field(default=settings.deepseek_base_url, min_length=8, max_length=500)
    model: str = Field(default=settings.deepseek_model, min_length=1, max_length=120)


@router.get("/model")
def get_model_settings(db: Session = Depends(get_db)):
    return public_model_settings(db)


@router.put("/model")
def update_model_settings(payload: ModelSettingsPayload, db: Session = Depends(get_db)):
    # The API key is intentionally never included in the response or application logs.
    return save_model_settings(
        db,
        api_key=payload.api_key.strip() if payload.api_key else None,
        clear_api_key=payload.clear_api_key,
        base_url=payload.base_url,
        model=payload.model,
    )
