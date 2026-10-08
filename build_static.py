from pathlib import Path
import shutil
source = Path(__file__).parent
output = source / "public" / "static"
output.mkdir(parents=True, exist_ok=True)
for name in ("style.css", "workspace.js"):
    shutil.copy2(source / "static" / name, output / name)
