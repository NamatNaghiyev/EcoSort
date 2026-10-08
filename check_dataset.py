import os
from collections import defaultdict

DATASET_DIR = "dataset"
SPLITS      = ["train", "val", "test"]

# ─────────────────────────────────────────────
# Şəkil saylarını topla
# ─────────────────────────────────────────────
data   = defaultdict(dict)
totals = defaultdict(int)

all_classes = set()

for split in SPLITS:
    split_path = os.path.join(DATASET_DIR, split)

    if not os.path.exists(split_path):
        print(f"⚠️  {split_path} tapılmadı")
        continue

    for class_name in sorted(os.listdir(split_path)):
        class_path = os.path.join(split_path, class_name)

        if not os.path.isdir(class_path):
            continue

        count = len([
            f for f in os.listdir(class_path)
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
        ])

        data[class_name][split] = count
        totals[split]          += count
        all_classes.add(class_name)

# ─────────────────────────────────────────────
# Cədvəl çap et
# ─────────────────────────────────────────────
col_w = 10
print("\n" + "="*(col_w * (len(SPLITS) + 2)))
print(f"{'Sinif':<{col_w}}", end="")
for split in SPLITS:
    print(f"{split.capitalize():>{col_w}}", end="")
print(f"{'Cəmi':>{col_w}}")
print("="*(col_w * (len(SPLITS) + 2)))

for class_name in sorted(all_classes):
    row_total = sum(data[class_name].get(s, 0) for s in SPLITS)
    print(f"{class_name:<{col_w}}", end="")
    for split in SPLITS:
        print(f"{data[class_name].get(split, 0):>{col_w}}", end="")
    print(f"{row_total:>{col_w}}")

print("="*(col_w * (len(SPLITS) + 2)))
grand_total = sum(totals.values())
print(f"{'TOPLAM':<{col_w}}", end="")
for split in SPLITS:
    print(f"{totals.get(split, 0):>{col_w}}", end="")
print(f"{grand_total:>{col_w}}")
print("="*(col_w * (len(SPLITS) + 2)))

# ─────────────────────────────────────────────
# Xəbərdarlıqlar
# ─────────────────────────────────────────────
print()
counts = [sum(data[c].get(s, 0) for s in SPLITS) for c in all_classes]
if counts:
    max_c, min_c = max(counts), min(counts)
    ratio = max_c / min_c if min_c > 0 else float("inf")
    if ratio > 2.0:
        print(f"⚠️  Dataset imbalanced! Maks/Min nisbəti: {ratio:.1f}x")
        print("   train.py-də class_weight istifadə edin.")
    else:
        print(f"✅ Dataset balanslaşdırılmış (maks/min: {ratio:.1f}x)")