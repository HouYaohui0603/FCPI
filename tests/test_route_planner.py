import pytest

from backend.services.route_planner import plan_s_route


def test_s_route_generates_ordered_waypoints_inside_local_bounds():
    polygon = [
        {"x": 0, "y": 0},
        {"x": 200, "y": 0},
        {"x": 200, "y": 200},
        {"x": 0, "y": 200},
    ]

    route = plan_s_route(polygon, spacing_m=20)

    assert len(route) > 3
    assert [point["order"] for point in route] == list(range(1, len(route) + 1))
    assert all(0 <= point["x"] <= 200 for point in route)
    assert all(0 <= point["y"] <= 200 for point in route)


def test_s_route_alternates_row_direction():
    polygon = [
        {"x": 0, "y": 0},
        {"x": 140, "y": 0},
        {"x": 140, "y": 90},
        {"x": 0, "y": 90},
    ]

    route = plan_s_route(polygon, spacing_m=30)
    rows = {}
    for point in route:
        rows.setdefault(point["y"], []).append(point["x"])
    multi_point_rows = [xs for xs in rows.values() if len(xs) > 1]

    assert len(multi_point_rows) >= 2
    assert multi_point_rows[0][0] < multi_point_rows[0][-1]
    assert multi_point_rows[1][0] > multi_point_rows[1][-1]


def test_s_route_rejects_invalid_input():
    with pytest.raises(ValueError):
        plan_s_route([{"x": 0, "y": 0}], spacing_m=20)

    with pytest.raises(ValueError):
        plan_s_route(
            [
                {"x": 0, "y": 0},
                {"x": 100, "y": 0},
                {"x": 100, "y": 80},
            ],
            spacing_m=0,
        )
