import os
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "1")
os.environ.setdefault("TF_NUM_INTEROP_THREADS", "1")
import json
import threading
import hashlib
from ecosort_domain import decision_for
import warnings
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
                        "top_results": top_results, "low_confidence": confidence < 0.5,
                        "description": info.get("description"), "tips": info.get("tips", []),
                        "model_version": MODEL_VERSION, "decision": decision_for(label, round(confidence * 100, 2), top_results)})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        app.logger.exception("Image inference failed")
        return jsonify({"error": "Model analizi tamamlaya bilmədi. Bir az sonra yenidən sınayın."}), 503


if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
