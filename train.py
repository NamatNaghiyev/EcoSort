import os
import json
import numpy as np
import matplotlib.pyplot as plt
from sklearn.metrics import classification_report, confusion_matrix
import seaborn as sns
import tensorflow as tf
from tensorflow.keras import layers, models
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau


# Konfiqurasiya

IMG_SIZE      = (224, 224)
BATCH_SIZE    = 32
EPOCHS_FROZEN = 15   # Phase 1: base model dondurulmuş
EPOCHS_FINETUNE = 10 # Phase 2: fine-tuning

TRAIN_DIR = "dataset/train"
VAL_DIR   = "dataset/val"
TEST_DIR  = "dataset/test"

WEIGHTS_SAVE_PATH    = "models/best_weights.weights.h5"
FULL_MODEL_SAVE_PATH = "models/best_model.keras"
CLASS_NAMES_PATH     = "models/class_names.json"

os.makedirs("models", exist_ok=True)

# Dataset yüklənməsi

train_dataset = tf.keras.preprocessing.image_dataset_from_directory(
    TRAIN_DIR,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    label_mode="categorical",
    shuffle=True,
    seed=42
)

val_dataset = tf.keras.preprocessing.image_dataset_from_directory(
    VAL_DIR,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    label_mode="categorical",
    shuffle=False
)

test_dataset = tf.keras.preprocessing.image_dataset_from_directory(
    TEST_DIR,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    label_mode="categorical",
    shuffle=False
)

CLASS_NAMES = train_dataset.class_names
NUM_CLASSES  = len(CLASS_NAMES)
print(f"\n✅ Sinif sırası ({NUM_CLASSES} sinif): {CLASS_NAMES}")

with open(CLASS_NAMES_PATH, "w", encoding="utf-8") as f:
    json.dump(CLASS_NAMES, f, ensure_ascii=False)
print(f"✅ Class names saxlanıldı: {CLASS_NAMES_PATH}")


# Class weights 

class_counts = np.zeros(NUM_CLASSES)
for _, labels in train_dataset.unbatch():
    class_counts[np.argmax(labels.numpy())] += 1

total_samples = class_counts.sum()
class_weights = {
    i: total_samples / (NUM_CLASSES * count)
    for i, count in enumerate(class_counts)
}
print(f"\n📊 Class weights: { {CLASS_NAMES[i]: round(w, 3) for i, w in class_weights.items()} }")


# Performans optimizasiyası

AUTOTUNE      = tf.data.AUTOTUNE
train_dataset = train_dataset.prefetch(buffer_size=AUTOTUNE)
val_dataset   = val_dataset.prefetch(buffer_size=AUTOTUNE)
test_dataset  = test_dataset.prefetch(buffer_size=AUTOTUNE)


# Data Augmentation 

data_augmentation = tf.keras.Sequential([
    layers.RandomFlip("horizontal_and_vertical"),
    layers.RandomRotation(0.15),
    layers.RandomZoom(0.15),
    layers.RandomBrightness(0.1),
    layers.RandomContrast(0.1),
], name="data_augmentation")


# Model qurulması

def build_model(num_classes):
    base_model = MobileNetV2(
        input_shape=(224, 224, 3),
        include_top=False,
        weights="imagenet"
    )
    base_model.trainable = False  # Phase 1: dondurulmuş

    inputs = tf.keras.Input(shape=(224, 224, 3))

    # ✅ DÜZELTİLDİ: augmentation nəticəsi x-də saxlanılır
    x = data_augmentation(inputs)
    x = tf.keras.applications.mobilenet_v2.preprocess_input(x)
    x = base_model(x, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dense(256, activation="relu")(x)
    x = layers.Dropout(0.4)(x)
    x = layers.Dense(128, activation="relu")(x)
    x = layers.Dropout(0.3)(x)
    outputs = layers.Dense(num_classes, activation="softmax")(x)

    model = models.Model(inputs, outputs)
    return model, base_model

model, base_model = build_model(NUM_CLASSES)

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
    loss="categorical_crossentropy",
    metrics=["accuracy"]
)
model.summary()


# PHASE 1: Dondurulmuş base model ilə train

print("\n" + "="*50)
print("🔒 PHASE 1: Frozen base model training")
print("="*50)

callbacks_phase1 = [
    EarlyStopping(
        monitor="val_loss",
        patience=4,
        restore_best_weights=True,
        verbose=1
    ),
    ModelCheckpoint(
        WEIGHTS_SAVE_PATH,
        monitor="val_accuracy",
        save_best_only=True,
        save_weights_only=True,
        verbose=1
    ),
    ReduceLROnPlateau(
        monitor="val_loss",
        factor=0.5,
        patience=2,
        min_lr=1e-6,
        verbose=1
    )
]

history1 = model.fit(
    train_dataset,
    validation_data=val_dataset,
    epochs=EPOCHS_FROZEN,
    callbacks=callbacks_phase1,
    class_weight=class_weights
)


# PHASE 2: Fine-tuning 

print("\n" + "="*50)
print("🔓 PHASE 2: Fine-tuning (son 30 layer)")
print("="*50)

base_model.trainable = True
for layer in base_model.layers[:-30]:
    layer.trainable = False

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=1e-4),  # Daha kiçik LR
    loss="categorical_crossentropy",
    metrics=["accuracy"]
)

callbacks_phase2 = [
    EarlyStopping(
        monitor="val_loss",
        patience=5,
        restore_best_weights=True,
        verbose=1
    ),
    ModelCheckpoint(
        WEIGHTS_SAVE_PATH,
        monitor="val_accuracy",
        save_best_only=True,
        save_weights_only=True,
        verbose=1
    ),
    ReduceLROnPlateau(
        monitor="val_loss",
        factor=0.3,
        patience=2,
        min_lr=1e-7,
        verbose=1
    )
]

history2 = model.fit(
    train_dataset,
    validation_data=val_dataset,
    epochs=EPOCHS_FINETUNE,
    callbacks=callbacks_phase2,
    class_weight=class_weights
)

# Ən yaxşı weights yüklə və tam modeli saxla

model.load_weights(WEIGHTS_SAVE_PATH)
model.save(FULL_MODEL_SAVE_PATH)
print(f"\n✅ Tam model saxlanıldı: {FULL_MODEL_SAVE_PATH}")


# Tarix qrafiki (hər iki phase birləşdirilmiş)

def merge_history(h1, h2, key):
    return h1.history.get(key, []) + h2.history.get(key, [])

all_acc     = merge_history(history1, history2, "accuracy")
all_val_acc = merge_history(history1, history2, "val_accuracy")
all_loss    = merge_history(history1, history2, "loss")
all_val_loss = merge_history(history1, history2, "val_loss")

phase1_end = len(history1.history["accuracy"])

fig, axes = plt.subplots(1, 2, figsize=(14, 5))

for ax, train_data, val_data, title, ylabel in [
    (axes[0], all_acc, all_val_acc, "Accuracy", "Accuracy"),
    (axes[1], all_loss, all_val_loss, "Loss", "Loss"),
]:
    ax.plot(train_data, label="Train", color="steelblue")
    ax.plot(val_data, label="Val", color="orange")
    ax.axvline(x=phase1_end - 1, color="gray", linestyle="--", label="Fine-tuning başladı")
    ax.set_title(title)
    ax.set_xlabel("Epoch")
    ax.set_ylabel(ylabel)
    ax.legend()
    ax.grid(alpha=0.3)

plt.tight_layout()
plt.savefig("models/training_history.png", dpi=150)
plt.show()
print("✅ Qrafik saxlanıldı: models/training_history.png")


# Test qiymətləndirməsi

test_loss, test_acc = model.evaluate(test_dataset, verbose=1)
print(f"\n{'='*40}")
print(f"✅ Test Accuracy : {test_acc*100:.2f}%")
print(f"✅ Test Loss     : {test_loss:.4f}")
print(f"{'='*40}")

y_true, y_pred = [], []
for images, labels in test_dataset:
    preds = model.predict(images, verbose=0)
    y_true.extend(np.argmax(labels.numpy(), axis=1))
    y_pred.extend(np.argmax(preds, axis=1))

print("\n📋 Classification Report:\n")
print(classification_report(y_true, y_pred, target_names=CLASS_NAMES))

# Confusion Matrix qrafiki
cm = confusion_matrix(y_true, y_pred)
plt.figure(figsize=(8, 6))
sns.heatmap(
    cm,
    annot=True,
    fmt="d",
    cmap="Blues",
    xticklabels=CLASS_NAMES,
    yticklabels=CLASS_NAMES
)
plt.title("Confusion Matrix")
plt.ylabel("Həqiqi sinif")
plt.xlabel("Proqnoz sinif")
plt.tight_layout()
plt.savefig("models/confusion_matrix.png", dpi=150)
plt.show()
print("✅ Confusion matrix saxlanıldı: models/confusion_matrix.png")