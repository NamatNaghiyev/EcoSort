import os
import json
import numpy as np
from PIL import Image
import tensorflow as tf
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from tensorflow.keras import layers, models
from tensorflow.keras.applications import MobileNetV2

# ════════════════════════════════════════════════════════════════════════
# Konfiqurasiya
# ════════════════════════════════════════════════════════════════════════

UPLOAD_FOLDER    = "static/uploads"
WEIGHTS_PATH     = "models/best_weights.weights.h5"
CLASS_NAMES_PATH = "models/class_names.json"
IMG_SIZE         = (224, 224)
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "bmp"}

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


# ════════════════════════════════════════════════════════════════════════
# Class adları
# ════════════════════════════════════════════════════════════════════════

with open(CLASS_NAMES_PATH, "r", encoding="utf-8") as f:
    CLASS_NAMES = json.load(f)

NUM_CLASSES = len(CLASS_NAMES)


# ════════════════════════════════════════════════════════════════════════
# Tullantı məlumatları
# ════════════════════════════════════════════════════════════════════════

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


# ════════════════════════════════════════════════════════════════════════
# Model qurulması və yüklənməsi
# ════════════════════════════════════════════════════════════════════════

def build_waste_model(num_classes):
    base = MobileNetV2(input_shape=(224, 224, 3), include_top=False, weights="imagenet")
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


print("⏳ Model yüklənir...")
waste_model = build_waste_model(NUM_CLASSES)
waste_model.load_weights(WEIGHTS_PATH)
print(f"✅ Model hazırdır → siniflər: {CLASS_NAMES}")


# ════════════════════════════════════════════════════════════════════════
# Köməkçi funksiyalar
# ════════════════════════════════════════════════════════════════════════

def allowed_file(filename):
    return "." in filename and \
           filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def predict_image(image_path, top_k=3):
    """
    Hər hansı şəkili oxuyub tullantı kateqoriyasına aid edir.
    Heç bir gate və ya OOD bloku yoxdur — şəkil həmişə analiz edilir.
    """
    # ── Şəkili oxu ────────────────────────────────────────────────────────
    try:
        img = Image.open(image_path).convert("RGB")
    except Exception:
        raise ValueError("Şəkil oxuna bilmədi. Düzgün şəkil faylı yükləyin.")

    w, h = img.size
    if w < 32 or h < 32:
        raise ValueError("Şəkil çox kiçikdir. Minimum 32×32 piksel tələb olunur.")

    # ── Ölçüləndirmə və preprocessing ─────────────────────────────────────
    img       = img.resize(IMG_SIZE)
    img_array = np.array(img, dtype=np.float32)
    img_array = np.expand_dims(img_array, axis=0)   # (1, 224, 224, 3)

    # ── Model proqnozu ─────────────────────────────────────────────────────
    preds = waste_model.predict(img_array, verbose=0)[0]

    top_indices = np.argsort(preds)[::-1][:top_k]
    label       = CLASS_NAMES[top_indices[0]]
    confidence  = float(preds[top_indices[0]])
    top_results = [
        {"label": CLASS_NAMES[i], "confidence": round(float(preds[i]) * 100, 2)}
        for i in top_indices
    ]

    return label, confidence, top_results


# ════════════════════════════════════════════════════════════════════════
# Əsas route
# ════════════════════════════════════════════════════════════════════════

@app.route("/", methods=["GET", "POST"])
def index():
    result, image_path, error = None, None, None

    if request.method == "POST":
        if "image" not in request.files:
            error = "Şəkil tapılmadı."
            return render_template("index.html", result=result,
                                   image_path=image_path, error=error)

        file = request.files["image"]

        if file.filename == "":
            error = "Şəkil seçilməyib."
            return render_template("index.html", result=result,
                                   image_path=image_path, error=error)

        if not allowed_file(file.filename):
            error = (f"❌ Dəstəklənməyən format. "
                     f"Yalnız {', '.join(e.upper() for e in ALLOWED_EXTENSIONS)} qəbul edilir.")
            return render_template("index.html", result=result,
                                   image_path=image_path, error=error)

        filename  = secure_filename(file.filename)
        save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(save_path)

        try:
            label, confidence, top_results = predict_image(save_path)

            info = WASTE_INFO.get(label, {
                "bin": "Naməlum", "color": "—", "emoji": "❓",
                "description": "Bu sinif üçün məlumat tapılmadı.", "tips": []
            })

            result = {
                "label":          label,
                "confidence":     round(confidence * 100, 2),
                "bin":            info["bin"],
                "color":          info["color"],
                "emoji":          info["emoji"],
                "description":    info["description"],
                "tips":           info["tips"],
                "top_results":    top_results,
                "low_confidence": confidence < 0.50
            }
            image_path = save_path.replace("\\", "/")

        except ValueError as e:
            error = f"⚠️ {str(e)}"
        except Exception as e:
            error = f"❌ Gözlənilməz xəta: {str(e)}"

    return render_template("index.html", result=result,
                           image_path=image_path, error=error)


# ════════════════════════════════════════════════════════════════════════
# API endpoint
# ════════════════════════════════════════════════════════════════════════

@app.route("/api/predict", methods=["POST"])
def api_predict():
    if "image" not in request.files:
        return jsonify({"error": "Şəkil tapılmadı"}), 400

    file = request.files["image"]
    if not allowed_file(file.filename):
        return jsonify({"error": "Yanlış fayl formatı"}), 400

    filename  = secure_filename(file.filename)
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(save_path)

    try:
        label, confidence, top_results = predict_image(save_path)
        return jsonify({
            "label":       label,
            "confidence":  round(confidence * 100, 2),
            "top_results": top_results
        })
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)