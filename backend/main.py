from __future__ import annotations

import json
import math
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.config import settings
from backend.services.detection import DetectionService, encoded_picture_url
from backend.services.reporting import build_report_bundle
from backend.services.route_planner import plan_s_route


app = FastAPI(title="智慧农林无人机虫害巡检终端", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

settings.upload_dir.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=settings.frontend_dir), name="static")
app.mount("/picture", StaticFiles(directory=settings.picture_dir), name="picture")
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

detection_service = DetectionService(settings.picture_dir, settings.detection_models)
REPORTS: dict[str, dict[str, Any]] = {}


class LocalPoint(BaseModel):
    x: float
    y: float


class RouteRequest(BaseModel):
    polygon: list[LocalPoint] = Field(min_length=3)
    spacing_m: float = Field(gt=0)


class SampleImage(BaseModel):
    name: str
    source: str


class SampleDetectRequest(BaseModel):
    samples: list[SampleImage] = Field(min_length=1)
    waypoints: list[dict[str, Any]] = Field(default_factory=list)
    detection_model: str = ""
    llm_model: str = ""


@app.get("/")
def index() -> FileResponse:
    return FileResponse(settings.frontend_dir / "index.html")


@app.get("/api/config")
def config() -> dict[str, Any]:
    return {
        "mapMode": settings.map_mode,
        "methods": list(settings.detection_models),
        "detectionModels": list(settings.detection_models),
        "llmModels": list(settings.llm_models),
        "defaultDetectionModel": settings.default_detection_model,
        "defaultLlmModel": settings.default_llm_model,
        "defaultGpsOrigin": {
            "lat": settings.default_gps_lat,
            "lng": settings.default_gps_lng,
        },
        "fieldWidthM": settings.default_field_width_m,
        "fieldHeightM": settings.default_field_height_m,
        "mapBackgroundUrl": settings.map_background_url,
        "defaultField": {
            "widthM": settings.default_field_width_m,
            "heightM": settings.default_field_height_m,
        },
        "defaultCanvasScale": settings.default_canvas_scale,
        "defaultSpacingM": settings.default_spacing_m,
        "defaultAltitudeM": settings.default_altitude_m,
        "overlapRatio": settings.overlap_ratio,
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/samples")
def samples() -> dict[str, list[dict[str, str]]]:
    return {
        "raw": _sample_files("raw"),
        "none": _sample_files("none"),
        "labeled": _sample_files("labeled"),
    }


@app.post("/api/plan-route")
def plan_route(request: RouteRequest) -> dict[str, Any]:
    polygon = [{"x": point.x, "y": point.y} for point in request.polygon]
    try:
        waypoints = [_with_gps(point) for point in plan_s_route(polygon, request.spacing_m)]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"waypoints": waypoints}


@app.post("/api/detect")
async def detect(
    files: list[UploadFile] = File(...),
    waypoints_json: str = Form("[]"),
    detection_model: str = Form(""),
    llm_model: str = Form(""),
) -> dict[str, Any]:
    session_id = uuid.uuid4().hex[:12]
    session_dir = settings.upload_dir / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    detection_model = _selected_value(
        detection_model,
        allowed=settings.detection_models,
        default=settings.default_detection_model,
    )
    llm_model = _selected_value(
        llm_model,
        allowed=settings.llm_models,
        default=settings.default_llm_model,
    )

    try:
        waypoints = json.loads(waypoints_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="waypoints_json is not valid JSON") from exc
    if not isinstance(waypoints, list):
        raise HTTPException(status_code=400, detail="waypoints_json must be a list")

    waypoint_by_order = _waypoint_index(waypoints)
    results = []

    for index, upload in enumerate(files, start=1):
        original_name = Path(upload.filename or f"image_{index}.jpg").name
        stored_name = f"{index:03d}_{original_name}"
        stored_path = session_dir / stored_name

        content = await upload.read()
        stored_path.write_bytes(content)

        raw_url = f"/uploads/{session_id}/{quote(stored_name)}"
        waypoint = waypoint_by_order.get(index)
        result = detection_service.detect_filename(
            filename=original_name,
            raw_url=raw_url,
            session_id=session_id,
            order=index,
            location=_local_location(waypoint),
            gps=_gps_location(waypoint),
            detection_model=detection_model,
            llm_model=llm_model,
        )
        results.append(result.to_dict())

    return _store_report(session_id, results, detection_model, llm_model, waypoint_count=len(waypoints))


@app.post("/api/detect-samples")
def detect_samples(request: SampleDetectRequest) -> dict[str, Any]:
    session_id = uuid.uuid4().hex[:12]
    detection_model = _selected_value(
        request.detection_model,
        allowed=settings.detection_models,
        default=settings.default_detection_model,
    )
    llm_model = _selected_value(
        request.llm_model,
        allowed=settings.llm_models,
        default=settings.default_llm_model,
    )

    waypoint_by_order = _waypoint_index(request.waypoints)
    results = []
    for index, sample in enumerate(request.samples, start=1):
        sample_name = Path(sample.name).name
        source = sample.source.strip()
        if source not in {"raw", "none", "labeled"}:
            raise HTTPException(status_code=400, detail=f"invalid sample source: {source}")
        sample_path = settings.picture_dir / source / sample_name
        if not sample_path.exists():
            raise HTTPException(status_code=404, detail=f"sample not found: {source}/{sample_name}")

        waypoint = waypoint_by_order.get(index)
        result = detection_service.detect_filename(
            filename=sample_name,
            raw_url=encoded_picture_url(source, sample_name),
            session_id=session_id,
            order=index,
            location=_local_location(waypoint),
            gps=_gps_location(waypoint),
            detection_model=detection_model,
            llm_model=llm_model,
        )
        results.append(result.to_dict())

    return _store_report(session_id, results, detection_model, llm_model, waypoint_count=len(request.waypoints))


@app.get("/api/report/{session_id}")
def report(session_id: str) -> dict[str, Any]:
    if session_id not in REPORTS:
        raise HTTPException(status_code=404, detail="report not found")
    return REPORTS[session_id]


def _waypoint_index(waypoints: list[Any]) -> dict[int, dict[str, Any]]:
    indexed: dict[int, dict[str, Any]] = {}
    for fallback_order, item in enumerate(waypoints, start=1):
        if not isinstance(item, dict):
            continue
        try:
            order = int(item.get("order", fallback_order))
            waypoint: dict[str, Any] = {"x": float(item["x"]), "y": float(item["y"])}
            gps = item.get("gps")
            if isinstance(gps, dict):
                waypoint["gps"] = {"lat": float(gps["lat"]), "lng": float(gps["lng"])}
            else:
                waypoint["gps"] = _gps_from_local(waypoint["x"], waypoint["y"])
            indexed[order] = waypoint
        except (KeyError, TypeError, ValueError):
            continue
    return indexed


def _sample_files(subdir: str) -> list[dict[str, str]]:
    directory = settings.picture_dir / subdir
    if not directory.exists():
        return []
    files = sorted(path for path in directory.iterdir() if path.is_file())
    return [{"name": path.name, "source": subdir, "url": encoded_picture_url(subdir, path.name)} for path in files]


def _store_report(
    session_id: str,
    results: list[dict[str, Any]],
    detection_model: str,
    llm_model: str,
    waypoint_count: int | None = None,
) -> dict[str, Any]:
    report = build_report_bundle(
        session_id=session_id,
        results=results,
        detection_model=detection_model,
        llm_model=llm_model,
        waypoint_count=waypoint_count,
    )
    REPORTS[session_id] = report
    return report


def _with_gps(point: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(point)
    enriched["gps"] = _gps_from_local(float(point["x"]), float(point["y"]))
    return enriched


def _gps_from_local(x: float, y: float) -> dict[str, float]:
    lat = settings.default_gps_lat + y / 111_320
    lng_scale = 111_320 * math.cos(math.radians(settings.default_gps_lat))
    lng = settings.default_gps_lng + x / lng_scale if lng_scale else settings.default_gps_lng
    return {"lat": round(lat, 6), "lng": round(lng, 6)}


def _local_location(waypoint: dict[str, Any] | None) -> dict[str, float] | None:
    if not waypoint:
        return None
    return {"x": float(waypoint["x"]), "y": float(waypoint["y"])}


def _gps_location(waypoint: dict[str, Any] | None) -> dict[str, float] | None:
    if not waypoint:
        return None
    gps = waypoint.get("gps")
    if not isinstance(gps, dict):
        return _gps_from_local(float(waypoint["x"]), float(waypoint["y"]))
    return {"lat": float(gps["lat"]), "lng": float(gps["lng"])}


def _selected_value(value: str, *, allowed: tuple[str, ...], default: str) -> str:
    cleaned = value.strip()
    if cleaned in allowed:
        return cleaned
    return default if default in allowed else allowed[0]
