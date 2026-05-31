from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = PROJECT_ROOT / "frontend"
PICTURE_DIR = PROJECT_ROOT / "picture"
UPLOAD_DIR = PROJECT_ROOT / "uploads"


def _load_env_file() -> None:
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


_load_env_file()


@dataclass(frozen=True)
class Settings:
    map_mode: str = "local-canvas"
    detection_models: tuple[str, ...] = ("Ours", "YOLOv8-N", "YOLOv12-S", "RT-DETR-S")
    llm_models: tuple[str, ...] = ("DS", "Minimax", "国产大模型 API", "自定义 API 接入")
    default_detection_model: str = os.getenv("DEFAULT_DETECTION_MODEL", "Ours")
    default_llm_model: str = os.getenv("DEFAULT_LLM_MODEL", "DS")
    default_gps_lat: float = _float_env("DEFAULT_GPS_LAT", 39.9)
    default_gps_lng: float = _float_env("DEFAULT_GPS_LNG", 116.39)
    map_background_url: str = os.getenv("MAP_BACKGROUND_URL", "/static/assets/wheat-field-200m.png")
    default_field_width_m: float = _float_env("DEFAULT_FIELD_WIDTH_M", 200)
    default_field_height_m: float = _float_env("DEFAULT_FIELD_HEIGHT_M", 200)
    default_canvas_scale: float = _float_env("DEFAULT_CANVAS_SCALE", 4.0)
    default_spacing_m: int = _int_env("DEFAULT_SPACING_M", 30)
    default_altitude_m: float = _float_env("DEFAULT_ALTITUDE_M", 1.0)
    overlap_ratio: float = _float_env("OVERLAP_RATIO", 0.2)
    app_host: str = os.getenv("APP_HOST", "0.0.0.0")
    app_port: int = _int_env("APP_PORT", 8000)
    upload_dir: Path = UPLOAD_DIR
    picture_dir: Path = PICTURE_DIR
    frontend_dir: Path = FRONTEND_DIR


settings = Settings()
