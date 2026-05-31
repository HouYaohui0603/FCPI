from urllib.parse import unquote

from backend.config import PICTURE_DIR
from fastapi.testclient import TestClient

from backend.main import _waypoint_index, app, config
from backend.services.detection import DetectionService, pest_type_from_filename


def make_service() -> DetectionService:
    return DetectionService(PICTURE_DIR)


def test_config_exposes_ui_display_fields():
    data = config()

    assert data["mapMode"] == "local-canvas"
    assert data["detectionModels"] == ["Ours", "YOLOv8-N", "YOLOv12-S", "RT-DETR-S"]
    assert data["llmModels"] == ["DS", "Minimax", "国产大模型 API", "自定义 API 接入"]
    assert data["defaultDetectionModel"] == "Ours"
    assert data["defaultLlmModel"] == "DS"
    assert data["defaultGpsOrigin"] == {"lat": 39.9, "lng": 116.39}
    assert data["fieldWidthM"] == 200
    assert data["fieldHeightM"] == 200
    assert data["mapBackgroundUrl"] == "/static/assets/wheat-field-200m.png"
    assert data["defaultField"] == {"widthM": 200, "heightM": 200}
    assert data["defaultSpacingM"] == 30
    assert data["defaultAltitudeM"] == 1.0
    assert data["overlapRatio"] == 0.2


def test_raw_image_matches_same_labeled_image_and_display_fields():
    result = make_service().detect_filename(
        filename="蝗虫若虫_1.jpg",
        raw_url="/uploads/s/001.jpg",
        session_id="s",
        order=1,
        location={"x": 42.5, "y": 18.0},
        gps={"lat": 39.900162, "lng": 116.390498},
        detection_model="Ours",
        llm_model="DS",
    )
    data = result.to_dict()

    assert result.pest_found is True
    assert result.pest_type == "蝗虫若虫"
    assert result.spot_id == "SPOT-001"
    assert result.severity in {"低风险", "中风险", "高风险"}
    assert unquote(result.output_url).endswith("/picture/labeled/蝗虫若虫_1.jpg")
    assert result.location == {"x": 42.5, "y": 18.0}
    assert result.gps == {"lat": 39.900162, "lng": 116.390498}
    assert result.detection_model == "Ours"
    assert result.llm_model == "DS"
    assert result.preprocess_steps == ["畸变校正", "尺度归一化", "光照增强"]
    assert result.boxes and result.boxes[0]["label"] == "蝗虫若虫"
    assert "虫害异常点" in result.alert_message
    assert data["methodOutputs"] == {
        "Ours": result.output_url,
        "YOLOv8-N": result.output_url,
        "YOLOv12-S": result.output_url,
        "RT-DETR-S": result.output_url,
    }


def test_raw_image_matches_out_prefixed_labeled_image():
    result = make_service().detect_filename(
        filename="模拟_1.jpg",
        raw_url="/uploads/s/001.jpg",
        session_id="s",
        order=1,
        location=None,
        gps=None,
        detection_model="Ours",
        llm_model="DS",
    )

    assert result.pest_found is True
    assert result.pest_type == "模拟"
    assert unquote(result.output_url).endswith("/picture/labeled/out_模拟_1.jpg")


def test_none_image_returns_original_none_image():
    result = make_service().detect_filename(
        filename="无虫害_1.jpg",
        raw_url="/uploads/s/001.jpg",
        session_id="s",
        order=1,
        location=None,
        gps=None,
        detection_model="Ours",
        llm_model="DS",
    )

    assert result.pest_found is False
    assert result.pest_type == "无虫害"
    assert result.severity == "正常"
    assert result.confidence == 0.0
    assert result.boxes == []
    assert result.alert_message == "未发现虫害异常"
    assert unquote(result.output_url).endswith("/picture/none/无虫害_1.jpg")


def test_pest_type_parser_handles_prefix_and_numeric_suffix():
    assert pest_type_from_filename("out_尖翅翠蛱蝶幼虫_12.jpg") == "尖翅翠蛱蝶幼虫"
    assert pest_type_from_filename("枯叶蝗_1.jpg") == "枯叶蝗"


def test_waypoint_index_binds_upload_order_to_local_coordinates():
    waypoints = [
        {"order": 1, "x": 10.0, "y": 15.0},
        {"order": 2, "x": 30.5, "y": 15.0},
    ]

    indexed = _waypoint_index(waypoints)

    assert indexed[1]["x"] == 10.0
    assert indexed[1]["y"] == 15.0
    assert indexed[1]["gps"] == {"lat": 39.900135, "lng": 116.390117}
    assert indexed[2]["x"] == 30.5
    assert indexed[2]["y"] == 15.0
    assert indexed[2]["gps"] == {"lat": 39.900135, "lng": 116.390357}


def test_detect_api_accepts_model_choices_and_builds_report_template():
    client = TestClient(app)
    response = client.post(
        "/api/detect",
        data={
            "waypoints_json": '[{"order":1,"x":10,"y":10,"gps":{"lat":39.90009,"lng":116.390117}}]',
            "detection_model": "YOLOv12-S",
            "llm_model": "Minimax",
        },
        files=[("files", ("蝗虫若虫_1.jpg", b"fake", "image/jpeg"))],
    )

    assert response.status_code == 200
    data = response.json()
    result = data["results"][0]
    assert result["detectionModel"] == "YOLOv12-S"
    assert result["llmModel"] == "Minimax"
    assert result["gps"] == {"lat": 39.90009, "lng": 116.390117}
    assert result["boxes"][0]["label"] == "蝗虫若虫"
    assert data["llmAnalysis"]["provider"] == "Minimax"
    assert data["llmAnalysis"]["mode"] == "template-only"
    assert data["chartData"]["trend"]
    assert set(data["chartData"]) >= {
        "severityCounts",
        "confidenceHistogram",
        "spatialHeatmap",
        "coverageStats",
        "topRiskSpots",
        "modelComparison",
        "historySeries",
        "riskRadar",
        "priorityMatrix",
        "missionTimeline",
        "spatialProjection",
    }
    assert data["chartData"]["coverageStats"] == {
        "waypoints": 1,
        "uploaded": 1,
        "coverageRatio": 1.0,
        "missing": 0,
    }
    assert data["chartData"]["topRiskSpots"][0]["spotId"] == "SPOT-001"
    assert len(data["chartData"]["historySeries"]) == 6
    assert len(data["chartData"]["riskRadar"]) == 5
    assert data["chartData"]["missionTimeline"][0]["status"] == "abnormal"
    assert set(data["chartData"]["spatialProjection"]) == {"xBins", "yBins"}
    for cell in data["chartData"]["spatialHeatmap"]:
        assert 0 <= cell["xBin"] < 5
        assert 0 <= cell["yBin"] < 5
    assert data["exportMeta"]["wordFileName"].endswith(".doc")


def test_detect_samples_api_uses_json_payload_and_matches_report_shape():
    client = TestClient(app)
    response = client.post(
        "/api/detect-samples",
        json={
            "samples": [
                {"name": "叶蝉_1.jpg", "source": "raw"},
                {"name": "无虫害_1.jpg", "source": "none"},
            ],
            "waypoints": [
                {"order": 1, "x": 10, "y": 10, "gps": {"lat": 39.90009, "lng": 116.390117}},
                {"order": 2, "x": 30, "y": 10, "gps": {"lat": 39.90009, "lng": 116.390351}},
            ],
            "detection_model": "Ours",
            "llm_model": "DS",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert set(data) >= {"sessionId", "results", "summary", "llmAnalysis", "chartData", "exportMeta"}
    assert len(data["results"]) == 2
    assert "/picture/raw/" in data["results"][0]["rawUrl"]
    assert data["results"][0]["pestFound"] is True
    assert data["results"][1]["pestFound"] is False
    assert data["summary"]["total"] == 2
    assert data["llmAnalysis"]["mode"] == "template-only"
    assert data["chartData"]["coverageStats"]["waypoints"] == 2
    assert data["chartData"]["coverageStats"]["uploaded"] == 2
    assert data["chartData"]["coverageStats"]["missing"] == 0
    assert data["chartData"]["confidenceHistogram"]
    assert data["chartData"]["severityCounts"]
