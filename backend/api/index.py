"""
Vercel Serverless Entrypoint for EV Verse FastAPI Backend.
"""
import sys
import importlib.util
from pathlib import Path

_this_dir = Path(__file__).resolve().parent
_backend_root = _this_dir.parent
_repo_root = _backend_root.parent

for p in (_repo_root, _backend_root):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

if "backend" not in sys.modules:
    spec = importlib.util.spec_from_file_location("backend", str(_backend_root / "__init__.py"))
    if spec and spec.loader:
        mod = importlib.util.module_from_spec(spec)
        sys.modules["backend"] = mod
        spec.loader.exec_module(mod)

from backend.api.main import app

