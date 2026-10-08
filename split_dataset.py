import os
import random
import shutil
from collections import defaultdict


# Parametrlər

RAW_DATASET_DIR    = "raw_dataset"
OUTPUT_DATASET_DIR = "dataset"
CLASSES            = ["plastic", "paper", "glass", "metal", "organic"]

TRAIN_RATIO = 0.70
VAL_RATIO   = 0.15
TEST_RATIO  = 0.15

assert abs(TRAIN_RATIO + VAL_RATIO + TEST_RATIO - 1.0) < 1e-9, \
    "Nisbətlərin cəmi 1.0 olmalıdır!"

random.seed(42)


# Qovluqları yarat

for split in ["train", "val", "test"]:
    for class_name in CLASSES:
        os.makedirs(os.path.join(OUTPUT_DATASET_DIR, split, class_name), exist_ok=True)


# Şəkilləri böl və köçür

stats = defaultdict(dict)

for class_name in CLASSES:
    class_input_dir = os.path.join(RAW_DATASET_DIR, class_name)

    if not os.path.exists(class_input_dir):
        print(f"⚠️  Qovluq tapılmadı: {class_input_dir}")
        continue

    images = [
        f for f in os.listdir(class_input_dir)
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    ]

    if not images:
        print(f"⚠️  {class_name}: şəkil tapılmadı")
        continue

    random.shuffle(images)

    total_count = len(images)
    train_count = int(total_count * TRAIN_RATIO)
    val_count   = int(total_count * VAL_RATIO)
    # Qalan hamısı test-ə gedir (yuvarlaqlaşma itkisini önləyir)
    test_count  = total_count - train_count - val_count

    splits_map = {
        "train": images[:train_count],
        "val":   images[train_count:train_count + val_count],
        "test":  images[train_count + val_count:]
    }

    for split_name, split_files in splits_map.items():
        for file_name in split_files:
            src = os.path.join(class_input_dir, file_name)
            dst = os.path.join(OUTPUT_DATASET_DIR, split_name, class_name, file_name)
            shutil.copy2(src, dst)
        stats[class_name][split_name] = len(split_files)


# Xülasə cədvəli

print("\n" + "="*55)
print(f"{'Sinif':<12} {'Train':>8} {'Val':>8} {'Test':>8} {'Cəmi':>8}")
print("="*55)

totals = {"train": 0, "val": 0, "test": 0}
for class_name in CLASSES:
    if class_name not in stats:
        continue
    tr = stats[class_name].get("train", 0)
    vl = stats[class_name].get("val", 0)
    te = stats[class_name].get("test", 0)
    print(f"{class_name:<12} {tr:>8} {vl:>8} {te:>8} {tr+vl+te:>8}")
    totals["train"] += tr
    totals["val"]   += vl
    totals["test"]  += te

print("="*55)
print(f"{'TOPLAM':<12} {totals['train']:>8} {totals['val']:>8} {totals['test']:>8} "
      f"{sum(totals.values()):>8}")
print("="*55)
print("\n✅ Dataset uğurla bölündü.")