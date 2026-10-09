import subprocess
from pathlib import Path

def test_static_build_includes_new_workspace_assets():
    subprocess.run(['python','build_static.py'],check=True)
    for name in ['style.css','workspace.js','suite.css','suite-core.js','suite.js','mvp.css','mvp.js']:
        assert (Path('public/static')/name).is_file(), name
