from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class _Point:
    x: float
    y: float


def plan_s_route(
    polygon: list[dict[str, float]],
    spacing_m: float,
    max_points: int = 500,
) -> list[dict[str, float | int]]:
    """Generate S-shaped photo waypoints inside a local meter-coordinate polygon."""

    if len(polygon) < 3:
        raise ValueError("polygon must contain at least 3 points")
    if spacing_m <= 0:
        raise ValueError("spacing_m must be greater than 0")

    points = [_Point(x=float(point["x"]), y=float(point["y"])) for point in polygon]
    min_y = min(point.y for point in points)
    max_y = max(point.y for point in points)

    route: list[_Point] = []
    for row_index, y in enumerate(_sweep_rows(min_y, max_y, spacing_m)):
        row_points: list[_Point] = []
        for start_x, end_x in _horizontal_segments(points, y):
            row_points.extend(_sample_segment(start_x, end_x, y, spacing_m))

        if row_index % 2 == 1:
            row_points.reverse()

        for point in row_points:
            route.append(point)
            if len(route) >= max_points:
                break
        if len(route) >= max_points:
            break

    if not route:
        route = [_polygon_centroid(points)]

    return [
        {
            "order": index,
            "x": round(point.x, 2),
            "y": round(point.y, 2),
        }
        for index, point in enumerate(route, start=1)
    ]


def _sweep_rows(min_y: float, max_y: float, spacing_m: float) -> list[float]:
    height = max_y - min_y
    if height <= spacing_m:
        return [(min_y + max_y) / 2]

    rows: list[float] = []
    y = min_y + spacing_m / 2
    while y < max_y:
        rows.append(y)
        y += spacing_m
    return rows or [(min_y + max_y) / 2]


def _horizontal_segments(points: list[_Point], y: float) -> list[tuple[float, float]]:
    intersections: list[float] = []
    point_count = len(points)

    for index in range(point_count):
        p1 = points[index]
        p2 = points[(index + 1) % point_count]
        if p1.y == p2.y:
            continue
        if (p1.y <= y < p2.y) or (p2.y <= y < p1.y):
            ratio = (y - p1.y) / (p2.y - p1.y)
            intersections.append(p1.x + ratio * (p2.x - p1.x))

    intersections.sort()
    segments: list[tuple[float, float]] = []
    for index in range(0, len(intersections) - 1, 2):
        start_x = intersections[index]
        end_x = intersections[index + 1]
        if end_x > start_x:
            segments.append((start_x, end_x))
    return segments


def _sample_segment(start_x: float, end_x: float, y: float, spacing_m: float) -> list[_Point]:
    width = end_x - start_x
    if width <= 0:
        return []
    if width <= spacing_m:
        return [_Point((start_x + end_x) / 2, y)]

    points: list[_Point] = []
    x = start_x + spacing_m / 2
    while x < end_x:
        points.append(_Point(x, y))
        x += spacing_m
    return points or [_Point((start_x + end_x) / 2, y)]


def _polygon_centroid(points: Iterable[_Point]) -> _Point:
    point_list = list(points)
    return _Point(
        x=sum(point.x for point in point_list) / len(point_list),
        y=sum(point.y for point in point_list) / len(point_list),
    )
