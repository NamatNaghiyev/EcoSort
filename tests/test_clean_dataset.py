import pytest
from PIL import Image

from tools.prepare_clean_dataset import plan_clean_split, write_clean_split


def make_png(path, color):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (40, 40), color=color).save(path)


def make_source(tmp_path):
    root = tmp_path / "raw_dataset"
    for i, label in enumerate(("glass", "metal", "organic", "paper", "plastic")):
        for j in range(8):
            make_png(root / label / f"image-{j}.png", (i * 42, j * 23, 15))
    return root


def test_clean_split_quarantines_conflicting_labels_and_deduplicates(tmp_path):
    root = make_source(tmp_path)
    same_label = root / "glass" / "duplicated.png"
    same_label.write_bytes((root / "glass" / "image-0.png").read_bytes())
    conflict = root / "paper" / "incorrect.png"
    conflict.write_bytes((root / "glass" / "image-1.png").read_bytes())
    assignments, report = plan_clean_split(root)
    assert report["exact_duplicates_excluded"] == 1
    assert report["conflicting_hash_groups_quarantined"] == 1
    assert report["distinct_accepted_images"] == 39
    hashes = [digest for _split, _label, _path, digest in assignments]
    assert len(set(hashes)) == len(hashes)
    output = write_clean_split(assignments, root, tmp_path / "dataset_clean")
    assert sum(1 for p in output.rglob("*.png")) == 39
    assert same_label.exists() and conflict.exists()
    with pytest.raises(FileExistsError):
        write_clean_split(assignments, root, output)


def test_split_plan_is_repeatable(tmp_path):
    root = make_source(tmp_path)
    a, _ = plan_clean_split(root, seed=42)
    b, _ = plan_clean_split(root, seed=42)
    assert a == b


def test_corrupt_image_is_rejected_without_crashing(tmp_path):
    root = make_source(tmp_path)
    (root / "glass" / "corrupt.png").write_bytes(b"not a png")
    _, report = plan_clean_split(root)
    assert report["invalid_images_count"] == 1


def test_refuses_source_overwrite(tmp_path):
    root = make_source(tmp_path)
    assignments, _ = plan_clean_split(root)
    with pytest.raises(ValueError):
        write_clean_split(assignments, root, root)
