import pytest

from ecosort_consensus import aggregate_frames


LABELS = ["glass", "metal", "organic", "paper", "plastic"]


def test_unanimous_high_confidence_accepted():
    result = aggregate_frames([
        [.02, .02, .01, .02, .93],
        [.03, .02, .02, .02, .91],
        [.01, .01, .03, .01, .94],
    ], LABELS)
    assert result["label"] == "plastic"
    assert result["accepted"] is True
    assert result["frames_analyzed"] == 3
    assert result["review_reason"] is None


def test_disagreement_is_unknown_even_when_average_top_is_high():
    result = aggregate_frames([
        [.01, .01, .01, .01, .96],
        [.01, .01, .01, .01, .96],
        [.96, .01, .01, .01, .01],
    ], LABELS)
    assert result["label"] == "unknown"
    assert result["accepted"] is False
    assert result["frame_labels"] == ["plastic", "plastic", "glass"]


def test_low_confidence_frame_forces_review():
    result = aggregate_frames([
        [.01, .01, .01, .01, .96],
        [.01, .01, .01, .01, .96],
        [.15, .14, .13, .12, .46],
    ], LABELS)
    assert result["label"] == "plastic"
    assert result["accepted"] is False
    assert result["review_reason"]


@pytest.mark.parametrize("bad_frames", [
    [[.9, .1]],
    [[.8, .2]] * 4,
    [[float("nan"), 1.0]] * 3,
    [[1.1, -.1]] * 3,
    [[.1, .1]] * 3,
])
def test_invalid_vectors_rejected(bad_frames):
    with pytest.raises(ValueError):
        aggregate_frames(bad_frames, ["glass", "plastic"])


def test_class_order_preserved():
    result = aggregate_frames([[.99, .01]] * 3, ["paper", "metal"])
    assert result["label"] == "paper"
