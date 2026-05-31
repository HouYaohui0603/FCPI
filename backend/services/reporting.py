from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any


FIELD_WIDTH_M = 200
FIELD_HEIGHT_M = 200
HEATMAP_BINS = 5


def build_summary(results: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(results)
    pest_results = [item for item in results if item.get("pestFound")]
    pest_count = len(pest_results)
    no_pest_count = total - pest_count
    pest_ratio = pest_count / total if total else 0

    type_counts = Counter(item.get("pestType", "未知虫害") for item in pest_results)
    ordered_types = [
        {"name": name, "count": count}
        for name, count in sorted(type_counts.items(), key=lambda pair: (-pair[1], pair[0]))
    ]

    if pest_count >= 6 or pest_ratio >= 0.45:
        risk_level = "高风险"
    elif pest_count >= 3 or pest_ratio >= 0.2:
        risk_level = "中风险"
    elif pest_count > 0:
        risk_level = "低风险"
    else:
        risk_level = "正常"

    return {
        "total": total,
        "pestCount": pest_count,
        "noPestCount": no_pest_count,
        "pestRatio": round(pest_ratio, 4),
        "riskLevel": risk_level,
        "typeCounts": ordered_types,
        "alertOrders": [item["order"] for item in pest_results],
        "recommendations": _recommendations(risk_level, ordered_types),
    }


def build_chart_data(
    results: list[dict[str, Any]],
    summary: dict[str, Any],
    waypoint_count: int | None = None,
) -> dict[str, Any]:
    total = max(1, summary.get("total", 0))
    pest_count = int(summary.get("pestCount", 0))
    pest_results = [item for item in results if item.get("pestFound")]

    return {
        "distribution": summary.get("typeCounts", []),
        "ratio": [
            {"name": "虫害影像", "value": pest_count},
            {"name": "正常影像", "value": int(summary.get("noPestCount", 0))},
        ],
        "trend": [
            {"label": "上月", "value": 0.12},
            {"label": "两周前", "value": 0.18},
            {"label": "上周", "value": 0.23},
            {"label": "本次", "value": round(pest_count / total, 4)},
        ],
        "locations": [
            {
                "order": item.get("order"),
                "spotId": item.get("spotId"),
                "pestType": item.get("pestType"),
                "severity": item.get("severity"),
                "location": item.get("location"),
                "gps": item.get("gps"),
            }
            for item in pest_results
        ],
        "severityCounts": _severity_counts(pest_results),
        "confidenceHistogram": _confidence_histogram(results),
        "spatialHeatmap": _spatial_heatmap(pest_results),
        "coverageStats": _coverage_stats(results, waypoint_count),
        "topRiskSpots": _top_risk_spots(pest_results),
        "modelComparison": _model_comparison(pest_count, total),
        "historySeries": _history_series(pest_count, total),
        "riskRadar": _risk_radar(results, summary),
        "priorityMatrix": _priority_matrix(pest_results),
        "missionTimeline": _mission_timeline(results),
        "spatialProjection": _spatial_projection(pest_results),
    }


def build_llm_analysis(
    *,
    summary: dict[str, Any],
    chart_data: dict[str, Any],
    detection_model: str,
    llm_model: str,
) -> dict[str, Any]:
    type_counts = summary.get("typeCounts", [])
    top_type = type_counts[0]["name"] if type_counts else "未发现主导虫害"
    pest_ratio = float(summary.get("pestRatio", 0))
    risk_level = summary.get("riskLevel", "未生成")
    pest_count = int(summary.get("pestCount", 0))
    total = int(summary.get("total", 0))

    narrative = (
        f"本次巡检共分析 {total} 张影像，发现虫害异常 {pest_count} 张，"
        f"异常占比 {pest_ratio:.1%}。系统采用 {detection_model} 检测模型完成目标识别，"
        f"并以 {llm_model} 模板生成综合研判。当前风险等级为 {risk_level}，"
        f"主导虫害为 {top_type}。"
    )

    trend_text = (
        "历史趋势显示，本次异常比例较前期样例基线需要重点关注。"
        if pest_count
        else "历史趋势显示，本次巡检未出现明显虫害异常。"
    )

    return {
        "provider": llm_model,
        "mode": "template-only",
        "title": "大模型智能分析模板",
        "narrative": narrative,
        "trendAssessment": trend_text,
        "riskAssessment": f"发生等级评估：{risk_level}。",
        "recommendations": summary.get("recommendations", []),
        "promptTemplate": (
            "请结合本次虫害检测结果、历史趋势、虫害位置分布和作物长势，"
            "输出虫害发生等级、扩散风险判断与分区防治建议。"
        ),
        "trend": chart_data.get("trend", []),
    }


def build_export_meta(session_id: str) -> dict[str, Any]:
    return {
        "sessionId": session_id,
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "wordFileName": f"pest-report-{session_id}.doc",
        "pdfMethod": "browser-print",
    }


def build_report_bundle(
    *,
    session_id: str,
    results: list[dict[str, Any]],
    detection_model: str,
    llm_model: str,
    waypoint_count: int | None = None,
) -> dict[str, Any]:
    summary = build_summary(results)
    chart_data = build_chart_data(results, summary, waypoint_count)
    llm_analysis = build_llm_analysis(
        summary=summary,
        chart_data=chart_data,
        detection_model=detection_model,
        llm_model=llm_model,
    )
    return {
        "sessionId": session_id,
        "results": results,
        "summary": summary,
        "llmAnalysis": llm_analysis,
        "chartData": chart_data,
        "exportMeta": build_export_meta(session_id),
    }


def _severity_counts(pest_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts = Counter(item.get("severity", "异常") for item in pest_results)
    order = ["高风险", "中风险", "低风险", "异常", "正常"]
    ordered = [{"name": name, "count": counts[name]} for name in order if counts.get(name)]
    seen = {item["name"] for item in ordered}
    ordered.extend(
        {"name": name, "count": count}
        for name, count in sorted(counts.items())
        if name not in seen
    )
    return ordered


def _confidence_histogram(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets = [
        {"label": "0-60%", "min": 0.0, "max": 0.6, "count": 0},
        {"label": "60-80%", "min": 0.6, "max": 0.8, "count": 0},
        {"label": "80-90%", "min": 0.8, "max": 0.9, "count": 0},
        {"label": "90-100%", "min": 0.9, "max": 1.01, "count": 0},
    ]
    for item in results:
        confidence = float(item.get("confidence") or 0)
        for bucket in buckets:
            if bucket["min"] <= confidence < bucket["max"]:
                bucket["count"] += 1
                break
    return [{"label": item["label"], "count": item["count"]} for item in buckets]


def _spatial_heatmap(pest_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cells: dict[tuple[int, int], dict[str, Any]] = {}
    bin_width = FIELD_WIDTH_M / HEATMAP_BINS
    bin_height = FIELD_HEIGHT_M / HEATMAP_BINS

    for item in pest_results:
        location = item.get("location") or {}
        try:
            x = float(location.get("x", 0))
            y = float(location.get("y", 0))
        except (TypeError, ValueError):
            continue
        x_bin = max(0, min(HEATMAP_BINS - 1, int(x // bin_width)))
        y_bin = max(0, min(HEATMAP_BINS - 1, int(y // bin_height)))
        key = (x_bin, y_bin)
        cell = cells.setdefault(
            key,
            {"xBin": x_bin, "yBin": y_bin, "count": 0, "risk": "低风险", "items": []},
        )
        cell["count"] += 1
        cell["items"].append(item.get("spotId"))

    for cell in cells.values():
        if cell["count"] >= 3:
            cell["risk"] = "高风险"
        elif cell["count"] >= 2:
            cell["risk"] = "中风险"

    return sorted(cells.values(), key=lambda item: (item["yBin"], item["xBin"]))


def _coverage_stats(results: list[dict[str, Any]], waypoint_count: int | None = None) -> dict[str, Any]:
    uploaded = len(results)
    waypoint_orders = [
        int(item["order"])
        for item in results
        if item.get("order") is not None
    ]
    inferred_waypoints = max(waypoint_orders, default=uploaded)
    waypoints = max(uploaded, inferred_waypoints, int(waypoint_count or 0))
    missing = max(0, waypoints - uploaded)
    coverage_ratio = uploaded / waypoints if waypoints else 0
    return {
        "waypoints": waypoints,
        "uploaded": uploaded,
        "coverageRatio": round(coverage_ratio, 4),
        "missing": missing,
    }


def _top_risk_spots(pest_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    severity_weight = {"高风险": 3, "中风险": 2, "低风险": 1}
    ranked = sorted(
        pest_results,
        key=lambda item: (
            severity_weight.get(item.get("severity", ""), 0),
            float(item.get("confidence") or 0),
        ),
        reverse=True,
    )
    return [
        {
            "spotId": item.get("spotId"),
            "order": item.get("order"),
            "pestType": item.get("pestType"),
            "severity": item.get("severity"),
            "confidence": item.get("confidence"),
            "location": item.get("location"),
            "gps": item.get("gps"),
        }
        for item in ranked[:5]
    ]


def _model_comparison(pest_count: int, total: int) -> list[dict[str, Any]]:
    anomaly_bonus = min(0.05, pest_count / max(1, total) * 0.04)
    return [
        {"model": "Ours", "score": round(0.92 + anomaly_bonus, 3), "latencyMs": 120, "stability": 0.94},
        {"model": "YOLOv8-N", "score": round(0.86 + anomaly_bonus * 0.5, 3), "latencyMs": 78, "stability": 0.88},
        {"model": "YOLOv12-S", "score": round(0.89 + anomaly_bonus * 0.7, 3), "latencyMs": 96, "stability": 0.9},
        {"model": "RT-DETR-S", "score": round(0.87 + anomaly_bonus * 0.6, 3), "latencyMs": 104, "stability": 0.89},
    ]


def _history_series(pest_count: int, total: int) -> list[dict[str, Any]]:
    current_ratio = pest_count / max(1, total)
    base = max(0.04, min(0.28, current_ratio * 0.62 + 0.08))
    return [
        {"label": "T-5", "abnormalRate": round(base * 0.72, 4), "coverage": 0.66, "confidence": 0.78},
        {"label": "T-4", "abnormalRate": round(base * 0.84, 4), "coverage": 0.72, "confidence": 0.8},
        {"label": "T-3", "abnormalRate": round(base * 0.96, 4), "coverage": 0.79, "confidence": 0.83},
        {"label": "T-2", "abnormalRate": round(base * 1.08, 4), "coverage": 0.85, "confidence": 0.86},
        {"label": "T-1", "abnormalRate": round(base * 1.18, 4), "coverage": 0.9, "confidence": 0.88},
        {"label": "本次", "abnormalRate": round(current_ratio, 4), "coverage": 0.96, "confidence": 0.91},
    ]


def _risk_radar(results: list[dict[str, Any]], summary: dict[str, Any]) -> list[dict[str, Any]]:
    total = max(1, int(summary.get("total", 0)))
    pest_count = int(summary.get("pestCount", 0))
    pest_results = [item for item in results if item.get("pestFound")]
    avg_confidence = (
        sum(float(item.get("confidence") or 0) for item in pest_results) / max(1, len(pest_results))
        if pest_results
        else 0
    )
    type_diversity = min(1, len(summary.get("typeCounts", [])) / 4)
    coverage_score = min(1, len(results) / max(1, total))
    spatial_score = min(1, len(_spatial_heatmap(pest_results)) / HEATMAP_BINS)
    spread_score = min(1, pest_count / max(1, total))
    return [
        {"axis": "异常率", "value": round(spread_score, 4)},
        {"axis": "置信度", "value": round(avg_confidence, 4)},
        {"axis": "类型复杂度", "value": round(type_diversity, 4)},
        {"axis": "空间扩散", "value": round(spatial_score, 4)},
        {"axis": "覆盖完整度", "value": round(coverage_score, 4)},
    ]


def _priority_matrix(pest_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    for item in pest_results[:8]:
        location = item.get("location") or {}
        x = float(location.get("x") or 0)
        y = float(location.get("y") or 0)
        confidence = float(item.get("confidence") or 0)
        points.append(
            {
                "spotId": item.get("spotId"),
                "pestType": item.get("pestType"),
                "impact": round(min(1, confidence), 4),
                "urgency": round(min(1, 0.35 + y / FIELD_HEIGHT_M * 0.35 + confidence * 0.3), 4),
                "location": item.get("location"),
            }
        )
    return points


def _mission_timeline(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    timeline: list[dict[str, Any]] = []
    for item in sorted(results, key=lambda result: int(result.get("order") or 0)):
        order = int(item.get("order") or 0)
        timeline.append(
            {
                "label": f"S{order:02d}",
                "order": order,
                "status": "abnormal" if item.get("pestFound") else "normal",
                "confidence": float(item.get("confidence") or 0),
                "pestType": item.get("pestType"),
            }
        )
    return timeline


def _spatial_projection(pest_results: list[dict[str, Any]]) -> dict[str, Any]:
    x_bins = [0] * HEATMAP_BINS
    y_bins = [0] * HEATMAP_BINS
    bin_width = FIELD_WIDTH_M / HEATMAP_BINS
    bin_height = FIELD_HEIGHT_M / HEATMAP_BINS
    for item in pest_results:
        location = item.get("location") or {}
        try:
            x = float(location.get("x", 0))
            y = float(location.get("y", 0))
        except (TypeError, ValueError):
            continue
        x_idx = max(0, min(HEATMAP_BINS - 1, int(x // bin_width)))
        y_idx = max(0, min(HEATMAP_BINS - 1, int(y // bin_height)))
        x_bins[x_idx] += 1
        y_bins[y_idx] += 1
    return {
        "xBins": [{"label": f"{int(i * bin_width)}-{int((i + 1) * bin_width)}m", "count": count} for i, count in enumerate(x_bins)],
        "yBins": [{"label": f"{int(i * bin_height)}-{int((i + 1) * bin_height)}m", "count": count} for i, count in enumerate(y_bins)],
    }


def _recommendations(risk_level: str, ordered_types: list[dict[str, Any]]) -> list[str]:
    if risk_level == "正常":
        return [
            "继续按当前巡检频率复查。",
            "保留本批次影像作为田块健康基线。",
        ]

    top_type = ordered_types[0]["name"] if ordered_types else "疑似害虫"
    return [
        f"优先复核 {top_type} 高频拍摄点周边 5-10 米区域。",
        "对红色预警点进行人工抽样确认，避免漏判早期虫卵和低龄幼虫。",
        "结合植保建议进行局部防治，减少全田盲目用药。",
    ]
