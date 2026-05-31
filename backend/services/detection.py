from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote


DEFAULT_DETECTION_MODELS = ("Ours", "YOLOv8-N", "YOLOv12-S", "RT-DETR-S")
PREPROCESS_STEPS = ["畸变校正", "尺度归一化", "光照增强"]


@dataclass(frozen=True)
class DetectionResult:
    session_id: str
    order: int
    spot_id: str
    file_name: str
    pest_found: bool
    pest_type: str
    severity: str
    confidence: float
    raw_url: str
    output_url: str
    method_outputs: dict[str, str]
    location: dict[str, float] | None
    gps: dict[str, float] | None
    boxes: list[dict[str, float | str]]
    detection_model: str
    llm_model: str
    preprocess_steps: list[str]
    alert_message: str
    source: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "sessionId": self.session_id,
            "order": self.order,
            "spotId": self.spot_id,
            "fileName": self.file_name,
            "pestFound": self.pest_found,
            "pestType": self.pest_type,
            "severity": self.severity,
            "confidence": self.confidence,
            "rawUrl": self.raw_url,
            "outputUrl": self.output_url,
            "methodOutputs": self.method_outputs,
            "location": self.location,
            "gps": self.gps,
            "boxes": self.boxes,
            "detectionModel": self.detection_model,
            "llmModel": self.llm_model,
            "preprocessSteps": self.preprocess_steps,
            "alertMessage": self.alert_message,
            "source": self.source,
        }


def pest_type_from_filename(filename: str) -> str:
    stem = Path(filename).stem
    if stem.startswith("out_"):
        stem = stem[4:]
    stem = re.sub(r"_\d+$", "", stem)
    return stem or "未知虫害"


def encoded_picture_url(subdir: str, filename: str) -> str:
    return f"/picture/{subdir}/{quote(filename)}"


class DetectionService:
    """Sample-image detector that can be swapped for a real model later."""

    def __init__(self, picture_dir: Path, detection_models: tuple[str, ...] = DEFAULT_DETECTION_MODELS):
        self.picture_dir = picture_dir
        self.raw_dir = picture_dir / "raw"
        self.labeled_dir = picture_dir / "labeled"
        self.none_dir = picture_dir / "none"
        self.detection_models = detection_models

    def detect_filename(
        self,
        *,
        filename: str,
        raw_url: str,
        session_id: str,
        order: int,
        location: dict[str, float] | None,
        gps: dict[str, float] | None,
        detection_model: str,
        llm_model: str,
    ) -> DetectionResult:
        clean_name = Path(filename).name
        spot_id = f"SPOT-{order:03d}"

        if self._is_no_pest(clean_name):
            output_url = self._none_output_url(clean_name, raw_url)
            return DetectionResult(
                session_id=session_id,
                order=order,
                spot_id=spot_id,
                file_name=clean_name,
                pest_found=False,
                pest_type="无虫害",
                severity="正常",
                confidence=0.0,
                raw_url=raw_url,
                output_url=output_url,
                method_outputs=self._method_outputs(output_url),
                location=location,
                gps=gps,
                boxes=[],
                detection_model=detection_model,
                llm_model=llm_model,
                preprocess_steps=PREPROCESS_STEPS,
                alert_message="未发现虫害异常",
                source="none",
            )

        output_url, source = self._labeled_output_url(clean_name, raw_url)
        confidence = self._confidence(clean_name)
        severity = self._severity(confidence)
        pest_type = pest_type_from_filename(clean_name)

        return DetectionResult(
            session_id=session_id,
            order=order,
            spot_id=spot_id,
            file_name=clean_name,
            pest_found=True,
            pest_type=pest_type,
            severity=severity,
            confidence=confidence,
            raw_url=raw_url,
            output_url=output_url,
            method_outputs=self._method_outputs(output_url),
            location=location,
            gps=gps,
            boxes=[self._box_for_filename(clean_name, pest_type)],
            detection_model=detection_model,
            llm_model=llm_model,
            preprocess_steps=PREPROCESS_STEPS,
            alert_message=f"发现{severity}虫害异常点：{pest_type}",
            source=source,
        )

    def _is_no_pest(self, filename: str) -> bool:
        return filename.startswith("无虫害_") or (self.none_dir / filename).exists()

    def _none_output_url(self, filename: str, fallback_url: str) -> str:
        if (self.none_dir / filename).exists():
            return encoded_picture_url("none", filename)
        return fallback_url

    def _labeled_output_url(self, filename: str, fallback_url: str) -> tuple[str, str]:
        same_name = self.labeled_dir / filename
        if same_name.exists():
            return encoded_picture_url("labeled", filename), "labeled"

        out_name = f"out_{filename}"
        out_path = self.labeled_dir / out_name
        if out_path.exists():
            return encoded_picture_url("labeled", out_name), "labeled"

        raw_path = self.raw_dir / filename
        if raw_path.exists():
            return encoded_picture_url("raw", filename), "raw-unlabeled"

        return fallback_url, "uploaded"

    def _method_outputs(self, output_url: str) -> dict[str, str]:
        return {model: output_url for model in self.detection_models}

    def _confidence(self, filename: str) -> float:
        digest = hashlib.sha1(filename.encode("utf-8")).digest()[0]
        return round(0.84 + (digest % 14) / 100, 2)

    def _severity(self, confidence: float) -> str:
        if confidence >= 0.94:
            return "高风险"
        if confidence >= 0.89:
            return "中风险"
        return "低风险"

    def _box_for_filename(self, filename: str, pest_type: str) -> dict[str, float | str]:
        digest = hashlib.sha1(filename.encode("utf-8")).digest()
        x = 0.18 + (digest[1] % 36) / 100
        y = 0.16 + (digest[2] % 34) / 100
        w = 0.18 + (digest[3] % 16) / 100
        h = 0.16 + (digest[4] % 15) / 100
        return {
            "label": pest_type,
            "x": round(min(x, 0.72), 2),
            "y": round(min(y, 0.72), 2),
            "w": round(min(w, 0.34), 2),
            "h": round(min(h, 0.34), 2),
        }
