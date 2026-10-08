import numpy as np
from PIL import Image
import tensorflow as tf

MODEL_PATH = "models/best_model.keras"
IMG_SIZE = (224, 224)

CLASS_NAMES = ["plastic", "paper", "glass", "metal", "organic"]

model = tf.keras.models.load_model(MODEL_PATH)

def predict_image(image_path):
    img = Image.open(image_path).convert("RGB")
    img = img.resize(IMG_SIZE)

    img_array = np.array(img)
    img_array = np.expand_dims(img_array, axis=0)

    img_array = tf.keras.applications.mobilenet_v2.preprocess_input(img_array)

    preds = model.predict(img_array)[0]
    class_idx = np.argmax(preds)
    confidence = preds[class_idx]

    return CLASS_NAMES[class_idx], float(confidence)

if __name__ == "__main__":
    path = input("Şəkilin yolunu yaz: ")
    label, conf = predict_image(path)

    print(f"\nNəticə: {label}")
    print(f"Confidence: {conf*100:.2f}%")