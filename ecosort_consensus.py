"""Conservative, auditable consensus for exactly three camera frames.

Only rejects ambiguous classifications. It cannot certify that a unanimous
prediction is correct, because adjacent frames are often correlated.
"""
import math

from ecosort_domain import CONFIDENCE_THRESHOLD, MARGIN_THRESHOLD

FRAME_COUNT = 3
MIN_FRAME_CONFIDENCE = 0.55


def aggregate_frames(frame_probabilities, labels):
    """Aggregate softmax vectors; never infer a route from disagreement.

    This pure-Python helper has no TensorFlow dependency and is unit-testable.
    """
    labels = list(labels)
    vectors = list(frame_probabilities)
    if len(vectors) != FRAME_COUNT or len(labels) < 2 or len(set(labels)) != len(labels):
        raise ValueError("Exactly three frames and distinct class names are required.")

    validated, votes, per_frame_conf = [], [], []
    for values in vectors:
        row = [float(value) for value in values]
        if (len(row) != len(labels) or
            any(not math.isfinite(value) or value < 0 or value > 1 for value in row) or
            abs(sum(row) - 1.0) > 0.02):
            raise ValueError("Invalid class probabilities.")
        winner = max(range(len(row)), key=row.__getitem__)
        votes.append(winner)
        per_frame_conf.append(row[winner])
        validated.append(row)

    means = [sum(row[i] for row in validated) / FRAME_COUNT for i in range(len(labels))]
    ranks = sorted(range(len(labels)), key=lambda i: means[i], reverse=True)
    leader, runner_up = ranks[:2]
    confidence = means[leader] * 100
    margin = (means[leader] - means[runner_up]) * 100
    unanimous = all(vote == leader for vote in votes)
    accepted = (unanimous and min(per_frame_conf) >= MIN_FRAME_CONFIDENCE
                and confidence >= CONFIDENCE_THRESHOLD and margin >= MARGIN_THRESHOLD)
    if not unanimous:
        reason = "Üç kamera kadrında kateqoriya nəticələri fərqlidir."
    elif min(per_frame_conf) < MIN_FRAME_CONFIDENCE:
        reason = "Ən azı bir kadrın nəticəsi qeyri-müəyyəndir."
    elif confidence < CONFIDENCE_THRESHOLD or margin < MARGIN_THRESHOLD:
        reason = "Orta etibar və ya siniflər arasındakı fərq kifayət etmir."
    else:
        reason = None

    return {
        "label": labels[leader] if unanimous else "unknown",
        "suggested_label": labels[leader],
        "confidence": round(confidence, 2),
        "margin_points": round(margin, 2),
        "top_results": [{"label": labels[i], "confidence": round(means[i] * 100, 2)}
                        for i in ranks[:3]],
        "frame_labels": [labels[i] for i in votes],
        "frame_confidences": [round(value * 100, 2) for value in per_frame_conf],
        "frames_analyzed": FRAME_COUNT,
        "unanimous": unanimous,
        "accepted": accepted,
        "review_reason": reason,
    }
