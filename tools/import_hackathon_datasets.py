#!/usr/bin/env python3
"""Add ZIP images to existing EcoSort train classes without changing old data."""
import argparse
import hashlib
import io
import json
from collections import Counter, defaultdict
from pathlib import Path
from zipfile import ZipFile
from PIL import Image

ORDER = ["glass", "metal", "organic", "paper", "plastic"]
ARCHIVES = {
    "glass": "glass.zip", "metal": "metal.zip", "organic": "organics.zip",
    "paper": "paper.zip", "plastic": "plactic.zip",
}
EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def file_sha(path):
    sha = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            sha.update(block)
    return sha.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default="incoming_zips")
    parser.add_argument("--dataset", default="dataset")
    parser.add_argument("--classes", default="models/class_names.json")
    parser.add_argument("--report", default="reports/hackathon_dataset_import.json")
    parser.add_argument("--apply", action="store_true",
                        help="Perform additive writes (default is dry run)")
    args = parser.parse_args()

    order = json.loads(Path(args.classes).read_text(encoding="utf-8"))
    if order != ORDER:
        raise ValueError(f"Refusing category reorder: {order} != {ORDER}")
    source, dataset = Path(args.source).resolve(), Path(args.dataset).resolve()
    if source == dataset or source in dataset.parents or dataset in source.parents:
        raise ValueError("ZIP source and dataset must be separate")

    existing = defaultdict(set)
    before = Counter()
    for split in ("train", "val", "test"):
        for label in ORDER:
            folder = dataset / split / label
            if not folder.is_dir():
                raise FileNotFoundError(str(folder))
            for f in folder.iterdir():
                if f.is_file() and f.suffix.lower() in EXT:
                    existing[file_sha(f)].add(label)
                    before[f"{split}/{label}"] += 1

    incoming = {}
    counted, bad = Counter(), []
    for label, zip_name in ARCHIVES.items():
        with ZipFile(source / zip_name) as archive:
            for member in archive.infolist():
                suffix = Path(member.filename).suffix.lower()
                if member.is_dir() or suffix not in EXT:
                    continue
                counted[f"received/{label}"] += 1
                content = archive.read(member)
                try:
                    with Image.open(io.BytesIO(content)) as im:
                        im.verify()
                    with Image.open(io.BytesIO(content)) as im:
                        if min(im.size) < 32:
                            raise ValueError("Small image")
                except (OSError, ValueError):
                    bad.append(f"{zip_name}:{member.filename}")
                    continue
                digest = hashlib.sha256(content).hexdigest()
                if digest not in incoming:
                    incoming[digest] = {
                        "label": label, "labels": {label}, "zip": zip_name,
                        "name": member.filename, "ext": suffix,
                    }
                else:
                    incoming[digest]["labels"].add(label)
                    counted["duplicate_inside_new"] += 1

    possible, rejected = [], Counter()
    for digest, item in incoming.items():
        label = item["label"]
        if item["labels"] != {label}:
            rejected["cross_label_conflict"] += 1
            continue
        if digest in existing:
            rejected["existing_label_conflict" if existing[digest] != {label}
                     else "already_in_dataset"] += 1
            continue
        destination = dataset / "train" / label / (
            f"ecosort_add_{digest[:24]}{item['ext']}")
        possible.append((digest, item, destination))

    copied = 0
    if args.apply:
        for digest, item, destination in possible:
            if destination.exists():
                if file_sha(destination) != digest:
                    raise FileExistsError(str(destination))
                continue
            with ZipFile(source / item["zip"]) as z:
                data = z.read(item["name"])
            if hashlib.sha256(data).hexdigest() != digest:
                raise ValueError("ZIP content changed during import")
            try:
                with destination.open("xb") as out:
                    out.write(data)
            except Exception:
                destination.unlink(missing_ok=True)
                raise
            copied += 1

    report = {
        "class_order": ORDER, "dry_run": not args.apply,
        "original_count": sum(before.values()), "original_by_split": dict(before),
        "incoming_count": dict(counted), "invalid": bad,
        "skipped": dict(rejected), "eligible_to_add": len(possible),
        "newly_copied": copied, "deleted_or_overwritten_originals": 0,
        "validation_and_test_modified": False,
        "note": "Exact SHA-256 dedup; labels and near-duplicates still need human review. No model retraining performed.",
    }
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2),
                           encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
