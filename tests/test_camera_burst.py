import io
from unittest.mock import patch

import numpy as np
from PIL import Image

from app import app


def frame():
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), "grey").save(buf, format="PNG")
    buf.seek(0)
    return buf


def post_frames(client, count=3):
    return client.post("/api/predict-burst", data={
        "frames": [(frame(), f"frame-{i}.png") for i in range(count)],
    })


def test_burst_requires_exactly_three_frames():
    with app.test_client() as client:
        assert post_frames(client, 2).status_code == 400
        assert post_frames(client, 4).status_code == 400


def test_burst_accepts_unanimous_strong_evidence_without_actuation():
    scores = np.asarray([
        [.01, .01, .01, .01, .96],
        [.01, .01, .01, .01, .96],
        [.01, .01, .01, .01, .96],
    ], dtype="float32")
    with patch("app.get_model", return_value=lambda batch, training=False: scores):
        with app.test_client() as client:
            response = post_frames(client)
    assert response.status_code == 200
    data = response.get_json()
    assert data["label"] == "plastic"
    assert data["accepted"] is True
    assert data["frames_analyzed"] == 3
    assert data["decision"]["hardware_connected"] is False
    assert data["robot_plan"]["hardware_command_sent"] is False


def test_burst_disagreement_forces_manual_review():
    scores = np.asarray([
        [.01, .01, .01, .01, .96],
        [.01, .01, .01, .01, .96],
        [.96, .01, .01, .01, .01],
    ], dtype="float32")
    with patch("app.get_model", return_value=lambda batch, training=False: scores):
        with app.test_client() as client:
            response = post_frames(client)
    assert response.status_code == 200
    data = response.get_json()
    assert data["label"] == "unknown"
    assert data["accepted"] is False
    assert data["decision"]["action"] == "review"
    assert data["robot_plan"]["code"] == "MANUAL_REVIEW"


def test_stricter_routing_threshold_applies_to_single_frame_too():
    from app import plan_robot_route
    plan = plan_robot_route("plastic", .70, [
        {"label": "plastic", "confidence": 70},
        {"label": "paper", "confidence": 5},
    ])
    assert plan["code"] == "MANUAL_REVIEW"
