"""Prepare a clean, disjoint dataset without modifying the original files.

Conservative exact SHA-256 duplicate handling, manual-review quarantine for
identical bytes with conflicting class labels. Similar-but-not-identical
images and camera-session leakage still require additional auditing.
"""
import argparse
import hashlib
import json
import random
import shutil
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, UnidentifiedImageError

CLASSES = ("glass", "metal", "organic", "paper", "plastic")
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
RATIOS = (0.70, 0.15, 0.15)


def plan_clean_split(source, seed=42):
    source = Path(source)
    if not source.is_dir():
        raise ValueError(f"Dataset source does not exist: {source}")
    hashed = defaultdict(list)
    invalid = []
    for label in CLASSES:
        folder = source / label
        if not folder.is_dir():
            raise ValueError(f"Missing class folder: {folder}")
        for path in sorted(folder.iterdir()):
            if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
                continue
            try:
                with Image.open(path) as img:
                    img.verify()
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
            except (OSError, ValueError, UnidentifiedImageError) as error:
                invalid.append({"path": str(path.relative_to(source)), "error": type(error).__name__})
                continue
            hashed[digest].append((label, path))

    groups = defaultdict(list)
    conflicts, extra_copies = [], 0
    for digest, items in hashed.items():
        labels = {label for label, _ in items}
        if len(labels) > 1:
            conflicts.append({"sha256": digest, "files": [
                str(path.relative_to(source)) for _, path in items]})
            continue
        label = items[0][0]
        extra_copies += len(items) - 1
        groups[label].append((digest, items[0][1]))

    rng = random.Random(seed)
    assignments = []
    counts = {}
    for label in CLASSES:
        distinct = sorted(groups[label], key=lambda item: item[0])
        rng.shuffle(distinct)
        n = len(distinct)
        train_end = int(RATIOS[0] * n)
        val_end = train_end + int(RATIOS[1] * n)
        for i, (digest, path) in enumerate(distinct):
            split = "train" if i < train_end else "val" if i < val_end else "test"
            assignments.append((split, label, path, digest))
        counts[label] = {"train": train_end, "val": val_end - train_end,
                         "test": n - val_end}
    report = {
        "source_images": sum(len(v) for v in hashed.values()) + len(invalid),
        "distinct_accepted_images": len(assignments),
        "exact_duplicates_excluded": extra_copies,
        "conflicting_hash_groups_quarantined": len(conflicts),
        "conflicts": conflicts[:100],
        "invalid_images_excluded": invalid[:100],
        "invalid_images_count": len(invalid),
        "counts": counts,
        "seed": seed,
        "limitations": [
            "Only byte-identical duplicates are grouped; near-duplicates require perceptual or human review.",
            "Do not put frames from the same camera/video session across train/val/test.",
            "Human label verification and a camera-only holdout test are still required.",
        ],
    }
    return assignments, report


def write_clean_split(assignments, source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination == source or source in destination.parents or destination in source.parents:
        raise ValueError("Output must not overlap the original dataset.")
    if destination.exists():
        raise FileExistsError(f"Refusing to overwrite existing output: {destination}")
    if not assignments:
        raise ValueError("No usable images found.")
    destination.mkdir(parents=True)
    for split, label, path, digest in assignments:
        folder = destination / split / label
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f"{digest[:16]}{path.suffix.lower()}"
        shutil.copy2(path, target)
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default="raw_dataset")
    parser.add_argument("--output", default="dataset_clean")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--write", action="store_true", help="Create a separate dataset_clean folder.")
    parser.add_argument("--report", default="reports/clean_split_plan.json")
    args = parser.parse_args()
    assignments, report = plan_clean_split(args.source, args.seed)
    if args.write:
        write_clean_split(assignments, args.source, args.output)
        report["output_created"] = str(Path(args.output).resolve())
    else:
        report["output_created"] = None
    path = Path(args.report)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "conflicts"}, ensure_ascii=False, indent=2))
    if report["conflicting_hash_groups_quarantined"]:
        print(f"Conflict groups require human label review: {path}")


if __name__ == "__main__":
    main()
