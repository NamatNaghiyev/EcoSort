import os
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "1")
os.environ.setdefault("TF_NUM_INTEROP_THREADS", "1")
import json
import threading
import hashlib
from ecosort_domain import decision_for, CONFIDENCE_THRESHOLD, MARGIN_THRESHOLD
from ecosort_consensus import aggregate_frames, FRAME_COUNT
import warnings
import math
import time
import urllib.parse
import urllib.request
from urllib.error import HTTPError, URLError
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from flask import Flask, render_template, request, jsonify
from werkzeug.exceptions import RequestEntityTooLarge

BASE_DIR = Path(__file__).resolve().parent
WEIGHTS_PATH = BASE_DIR / "models/best_weights.weights.h5"
CLASS_NAMES_PATH = BASE_DIR / "models/class_names.json"
IMG_SIZE = (224, 224)
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "bmp"}
Image.MAX_IMAGE_PIXELS = 25_000_000
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024
with CLASS_NAMES_PATH.open(encoding="utf-8") as f:
    CLASS_NAMES = json.load(f)
NUM_CLASSES = len(CLASS_NAMES)
MODEL_VERSION = hashlib.sha256(WEIGHTS_PATH.read_bytes()).hexdigest()[:12] if WEIGHTS_PATH.is_file() else "missing"

WASTE_INFO = {
    "plastic": {
        "bin": "Plastik təkrar emal qutusu",
        "color": "Sarı", "emoji": "🟡",
        "description": "Plastik tullantılar təbiətdə 400-1000 il qala bilər.",
        "tips": [
            "Plastik şüşələrin qapaqlarını çıxarın",
            "Yağlı plastikləri yuyun",
            "Birdəfəlik plastiklərdən qaçının"
        ]
    },
    "paper": {
        "bin": "Kağız/karton təkrar emal qutusu",
        "color": "Mavi", "emoji": "🔵",
        "description": "Kağız və karton tullantıları asan təkrar emal olunur.",
        "tips": [
            "Karton qutularını düzləşdirin",
            "Pizza qutularının yağlı hissələrini kəsin",
            "Islanmış kağızları ayrı atın"
        ]
    },
    "glass": {
        "bin": "Şüşə təkrar emal qutusu",
        "color": "Yaşıl", "emoji": "🟢",
        "description": "Şüşə sonsuz dəfə keyfiyyət itkisi olmadan təkrar emal edilə bilər.",
        "tips": [
            "Şüşəni rənginə görə ayırın",
            "Şüşəni sındırmadan atın",
            "Qapaqları ayrıca metal qutusuna atın"
        ]
    },
    "metal": {
        "bin": "Metal təkrar emal qutusu",
        "color": "Boz", "emoji": "⚫",
        "description": "Alüminium kimi metallar sonsuz dəfə təkrar emal oluna bilər.",
        "tips": [
            "Konserv qutularını yuyun",
            "Alüminium folqanı toparlayın",
            "Aerozol qutularını tamamilə boşaldın"
        ]
    },
    "organic": {
        "bin": "Orqanik tullantı / kompost qutusu",
        "color": "Qəhvəyi", "emoji": "🟤",
        "description": "Qida qalıqları kompostlanaraq torpağı zənginləşdirə bilər.",
        "tips": [
            "Ət və süd məhsullarını kompostdan ayırın",
            "Mətbəx tullantılarını ayrı toplayın",
            "Bağ tullantılarını da kompostlaya bilərsiniz"
        ]
    }
}


def build_waste_model(num_classes):
    import tensorflow as tf
    from tensorflow.keras import layers, models
    from tensorflow.keras.applications import MobileNetV2
    base = MobileNetV2(input_shape=(224, 224, 3), include_top=False, weights=None)
    base.trainable = False
    inputs = tf.keras.Input(shape=(224, 224, 3))
    x = tf.keras.applications.mobilenet_v2.preprocess_input(inputs)
    x = base(x, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dense(256, activation="relu")(x)
    x = layers.Dropout(0.4)(x)
    x = layers.Dense(128, activation="relu")(x)
    x = layers.Dropout(0.3)(x)
    outputs = layers.Dense(num_classes, activation="softmax")(x)
    return models.Model(inputs, outputs)


waste_model = None
model_lock = threading.Lock()

def get_model():
    global waste_model
    with model_lock:
        if waste_model is None:
            model = build_waste_model(NUM_CLASSES)
            model.load_weights(str(WEIGHTS_PATH))
            waste_model = model
    return waste_model


def allowed_file(filename):
    return bool(filename) and "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def prepare_image(image_source):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(image_source) as source:
                if source.width < 32 or source.height < 32:
                    raise ValueError("Şəkil ən azı 32 × 32 piksel olmalıdır.")
                if source.width * source.height > 25_000_000:
                    raise ValueError("Şəkil 25 meqapikseldən böyük olmamalıdır.")
                if source.format not in {"JPEG", "PNG", "WEBP", "BMP"}:
                    raise ValueError("Dəstəklənməyən şəkil formatı.")
                img = ImageOps.exif_transpose(source).convert("RGB").resize(IMG_SIZE, Image.Resampling.BILINEAR)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError("Şəkil oxuna bilmədi. Düzgün şəkil faylı seçin.") from exc
    batch = np.expand_dims(np.asarray(img, dtype=np.float32), axis=0)
    return batch


def predict_image(image_source, top_k=3):
    batch = prepare_image(image_source)
    # Direct inference avoids an extra tf.data threadpool for each web request.
    preds = np.asarray(get_model()(batch, training=False))[0]
    if preds.shape != (NUM_CLASSES,) or not np.all(np.isfinite(preds)):
        raise RuntimeError("Invalid model output")
    indices = np.argsort(preds)[::-1][:top_k]
    return CLASS_NAMES[indices[0]], float(preds[indices[0]]), [
        {"label": CLASS_NAMES[i], "confidence": round(float(preds[i]) * 100, 2)} for i in indices
    ]



# The classifier has no localisation, depth or calibrated robot geometry.
# These are DRY-RUN routing decisions, never physical robot commands.
def plan_robot_route(label, confidence, top_results, force_review=False):
    runner_up = top_results[1]["confidence"] / 100 if len(top_results) > 1 else 0.0
    uncertain = (force_review or confidence < CONFIDENCE_THRESHOLD / 100
                 or confidence - runner_up < MARGIN_THRESHOLD / 100)
    if uncertain or label not in CLASS_NAMES:
        code, route, reason = "MANUAL_REVIEW", "review", "Model nəticəsi qeyri-müəyyəndir."
    elif label == "organic":
        code, route, reason = "CONVEYOR_PASS", "through", "Üzvi axın: konveyer üzərində düz davam edir."
    elif label == "metal":
        code, route, reason = "FERROUS_SENSOR_CHECK", "sensor", "Maqnit yalnız ferromaqnit metallar üçün işləyir; sensor təsdiqi lazımdır."
    elif label in ("plastic", "paper"):
        code, route, reason = "GRIPPER_COORDINATE_REQUIRED", "gripper", "ReflexGrip üçün obyekt koordinatı və kamera kalibrasiyası lazımdır."
    else:
        code, route, reason = "MANUAL_HANDLING", "review", "Şüşə üçün təhlükəsiz tutuş və qırılma riski yoxlanmalıdır."
    return {
        "code": code, "route": route, "reason": reason,
        "mode": "simulation", "hardware_command_sent": False,
        "requires_confirmation": True,
        "localization_available": False,
        "calibrated_pick_coordinates": None
    }


# Read-only geodata from OSM via Overpass. No fabricated/seeded container pins.
_map_cache = {}
_map_cache_lock = threading.Lock()

@app.get("/api/containers")
def api_containers():
    raw = request.args.get("bbox", "")
    try:
        pieces = [float(v) for v in raw.split(",")]
        if len(pieces) != 4 or not all(math.isfinite(v) for v in pieces):
            raise ValueError()
        south, west, north, east = pieces
        if not (37.8 <= south < north <= 42.2 and 44.3 <= west < east <= 51.2):
            raise ValueError()
    except ValueError:
        return jsonify({"error": "Azərbaycan daxilində düzgün bbox formatı verin: south,west,north,east."}), 400
    if north - south > 0.35 or east - west > 0.35:
        return jsonify({"error": "Konteynerləri görmək üçün xəritəni küçə/rayon səviyyəsinə yaxınlaşdırın."}), 422

    key = tuple(round(v, 3) for v in pieces)
    with _map_cache_lock:
        hit = _map_cache.get(key)
        if hit and time.monotonic() - hit[0] < 300:
            return jsonify(hit[1])

    query = """[out:json][timeout:12];
    (
      node["amenity"~"^(waste_basket|waste_disposal|recycling)$"](%s,%s,%s,%s);
      way["amenity"~"^(waste_disposal|recycling)$"](%s,%s,%s,%s);
    );
    out center 350;""" % (south, west, north, east, south, west, north, east)
    body = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(
        "https://overpass.kumi.systems/api/interpreter",
        data=body,
        headers={"User-Agent": "EcoSortHackathonMVP/1.0 (https://github.com/NamatNaghiyev/EcoSort)",
                 "Content-Type": "application/x-www-form-urlencoded"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=14) as response:
            upstream = json.load(response)
        points = []
        for item in upstream.get("elements", []):
            tags = item.get("tags", {})
            centre = item.get("center") or item
            lat, lon = centre.get("lat"), centre.get("lon")
            kind = tags.get("amenity", "")
            if not isinstance(lat, (float, int)) or not isinstance(lon, (float, int)):
                continue
            if kind not in {"waste_basket", "waste_disposal", "recycling"}:
                continue
            points.append({
                "id": str(item.get("type", "node")) + "/" + str(item["id"]),
                "lat": lat, "lon": lon, "kind": kind,
                "name": str(tags.get("name", ""))[:90],
                "operator": str(tags.get("operator", ""))[:90],
                "osm_url": "https://www.openstreetmap.org/%s/%s" % (item.get("type", "node"), item["id"]),
                "source": "OpenStreetMap", "verified_on_site": False
            })
        result = {"source": "OpenStreetMap / Overpass", "points": points,
                  "count": len(points), "coverage_complete": False}
        with _map_cache_lock:
            if len(_map_cache) > 100:
                _map_cache.clear()
            _map_cache[key] = (time.monotonic(), result)
        return jsonify(result)
    except (URLError, HTTPError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        app.logger.warning("Overpass data unavailable: %s", exc)
        return jsonify({"error": "OSM konteyner məlumatı müvəqqəti əlçatan deyil. Xəritə işləyir, amma nöqtələr təsdiqlənə bilmir.",
                        "source": "OpenStreetMap / Overpass", "points": []}), 503


@app.get("/api/robot/status")
def robot_status():
    return jsonify({"mode": "simulation", "connected": False,
                    "actuation_enabled": False, "localization_available": False,
                    "message": "ReflexGrip cihaz əlaqəsi və koordinat kalibrasiyası hələ qurulmayıb."})


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    present = WEIGHTS_PATH.is_file()
    return jsonify({"status": "ok" if present else "model_missing", "model_loaded": waste_model is not None,
                    "model_available": present, "categories": CLASS_NAMES}), 200 if present else 503


@app.get("/api/quality")
def quality():
    report_path = BASE_DIR / "reports/evaluation.json"
    if not report_path.is_file():
        return jsonify({"status": "not_evaluated", "message": "Test hesabatı hələ yaradılmayıb."}), 503
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["current_model_version"] = MODEL_VERSION
    report["matches_current_model"] = report.get("model_sha256", "")[:12] == MODEL_VERSION
    return jsonify(report)


@app.errorhandler(RequestEntityTooLarge)
def too_large(error):
    return jsonify({"error": "Fayl ölçüsü limiti aşıldı. 3.5 MB-dan kiçik şəkil seçin."}), 413


@app.post("/api/predict")
def api_predict():
    file = request.files.get("image")
    if file is None or not file.filename:
        return jsonify({"error": "Şəkil seçilməyib."}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Yanlış fayl formatı."}), 400
    try:
        label, confidence, top_results = predict_image(file.stream)
        info = WASTE_INFO.get(label, {})
        return jsonify({"label": label, "confidence": round(confidence * 100, 2),
                        "top_results": top_results, "low_confidence": (confidence < CONFIDENCE_THRESHOLD / 100
                        or (confidence - top_results[1]['confidence'] / 100) < MARGIN_THRESHOLD / 100),
                        "description": info.get("description"), "tips": info.get("tips", []),
                        "model_version": MODEL_VERSION, "decision": decision_for(label, round(confidence * 100, 2), top_results),
                        "robot_plan": plan_robot_route(label, confidence, top_results)})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        app.logger.exception("Image inference failed")
        return jsonify({"error": "Model analizi tamamlaya bilmədi. Bir az sonra yenidən sınayın."}), 503


@app.post("/api/predict-burst")
def api_predict_burst():
    """Analyze three explicitly captured frames in one batch.

    Unanimity rejects unstable classifications. Frames may be correlated;
    this is a conservative routing gate, not a proven accuracy increase.
    """
    frames = request.files.getlist("frames")
    if len(frames) != FRAME_COUNT:
        return jsonify({"error": "Kamera analizi üçün dəqiq 3 kadr göndərilməlidir."}), 400
    if any(not frame.filename or not allowed_file(frame.filename) for frame in frames):
        return jsonify({"error": "Kadr formatı düzgün deyil."}), 400
    try:
        batch = np.concatenate([prepare_image(frame.stream) for frame in frames], axis=0)
        scores = np.asarray(get_model()(batch, training=False))
        if scores.shape != (FRAME_COUNT, NUM_CLASSES) or not np.all(np.isfinite(scores)):
            raise RuntimeError("Invalid batched model output")
        report = aggregate_frames(scores, CLASS_NAMES)
        label, confidence = report["label"], report["confidence"]
        top_results = report["top_results"]
        if report["accepted"]:
            decision = decision_for(label, confidence, top_results)
        else:
            decision = decision_for("unknown", 0, [])
            decision["reason"] = report["review_reason"] or decision["reason"]
        plan = plan_robot_route(label, confidence / 100, top_results,
                                force_review=not report["accepted"])
        if not report["accepted"]:
            plan["reason"] = report["review_reason"] or plan["reason"]
        return jsonify({**report, "low_confidence": not report["accepted"],
                        "decision": decision, "robot_plan": plan,
                        "model_version": MODEL_VERSION,
                        "description": WASTE_INFO.get(label, {}).get("description"),
                        "tips": WASTE_INFO.get(label, {}).get("tips", [])})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        app.logger.exception("Camera burst inference failed")
        return jsonify({"error": "Kamera kadrlarının analizi tamamlanmadı."}), 503


if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
