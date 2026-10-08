"""
Clean_dataset.py
────────────────
Dataset-dəki zədəli, oxunmayan və ya TensorFlow-un
qəbul etmədiyi formatlı şəkilləri tapır və silir.

Problem: PIL bəzi TIFF/RAW faylları .jpg adı ilə aça bilir,
amma TensorFlow decode_image() onları rədd edir.
Bu skript hər faylı HƏMDƏ TF ilə yoxlayır.

İşlət: train.py-dən ƏVVƏL
  python Clean_dataset.py
"""

import os
import tensorflow as tf
from PIL import Image, UnidentifiedImageError

# ─────────────────────────────────────────────
# Konfiqurasiya
# ─────────────────────────────────────────────
ROOTS      = ["dataset", "raw_dataset"]   # mövcud olanlar yoxlanır
VALID_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}

# ─────────────────────────────────────────────
# Köməkçi funksiyalar
# ─────────────────────────────────────────────

def _magic_bytes(path: str) -> bytes:
    """Faylın ilk 16 baytını oxuyur (format aşkarlamaq üçün)."""
    try:
        with open(path, "rb") as f:
            return f.read(16)
    except OSError:
        return b""


def _is_tiff(magic: bytes) -> bool:
    """TIFF faylları TF tərəfindən dəstəklənmir."""
    return magic[:4] in (b"II*\x00", b"MM\x00*")


def is_tf_valid(path: str):
    """
    Faylı üç mərhələdə yoxlayır:
      1. Magic bytes ilə gizli TIFF/RAW faylları aşkar et
      2. PIL ilə tam oxuma yoxla
      3. TensorFlow decode_image() ilə əsl dekodlaşdırma yoxla

    Qaytarır: (keçərlidir: bool, səbəb: str)
    """
    magic = _magic_bytes(path)

    # ── 1. Yanlış adlandırılmış TIFF aşkar et ──────────────────────
    if _is_tiff(magic):
        return False, "TIFF format — TF dəstəkləmir (yanlış uzantı)"

    # ── 2. PIL-lə tam oxuma ─────────────────────────────────────────
    try:
        with Image.open(path) as img:
            img.verify()
        with Image.open(path) as img:
            img.convert("RGB")
    except (UnidentifiedImageError, OSError, Exception) as e:
        return False, f"PIL xətası: {e}"

    # ── 3. TensorFlow decode_image() yoxlaması ──────────────────────
    # Bu mərhələ xətanın kökünü tutur:
    # TF yalnız JPEG, PNG, GIF, BMP, WebP qəbul edir
    try:
        raw = tf.io.read_file(path)
        tf.io.decode_image(raw, channels=3, expand_animations=False)
    except tf.errors.InvalidArgumentError as e:
        return False, f"TF decode xətası: {e.message.splitlines()[0]}"
    except Exception as e:
        return False, f"TF ümumi xəta: {e}"

    return True, "ok"


# ─────────────────────────────────────────────
# Əsas dövr
# ─────────────────────────────────────────────
removed = 0
kept    = 0
skipped = 0

for root_dir in ROOTS:
    if not os.path.exists(root_dir):
        continue

    print(f"\n📂 Yoxlanır: {root_dir}")
    print("─" * 55)

    for dirpath, _, filenames in os.walk(root_dir):
        for fname in sorted(filenames):
            ext = os.path.splitext(fname)[1].lower()

            if ext not in VALID_EXTS:
                skipped += 1
                continue

            fpath = os.path.join(dirpath, fname)
            valid, reason = is_tf_valid(fpath)

            if valid:
                kept += 1
            else:
                print(f"  ❌  Silinir  ({reason})")
                print(f"      → {fpath}")
                try:
                    os.remove(fpath)
                    removed += 1
                except OSError as e:
                    print(f"      ⚠️  Silinə bilmədi: {e}")

# ─────────────────────────────────────────────
# Xülasə
# ─────────────────────────────────────────────
print(f"\n{'='*55}")
print(f"✅  Saxlanılan : {kept}")
print(f"🗑   Silinen   : {removed}")
print(f"⏭   Keçilən   : {skipped}")
print(f"{'='*55}")

if removed == 0:
    print("\n🎉 Dataset TF üçün tamamilə təmizdir!")
else:
    print(f"\n⚠️  {removed} fayl silindi.")
    print("   İndi bu sırada yenidən işlət:")
    print("     1. split_dataset.py")
    print("     2. train.py")