"""
Entry point for Vercel Serverless Function & FastAPI execution.
"""
import sys
import importlib.util
from pathlib import Path

_backend_dir = Path(__file__).resolve().parent
_repo_dir = _backend_dir.parent

for p in (_repo_dir, _backend_dir):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

if "backend" not in sys.modules:
    spec = importlib.util.spec_from_file_location("backend", str(_backend_dir / "__init__.py"))
    if spec and spec.loader:
        mod = importlib.util.module_from_spec(spec)
        sys.modules["backend"] = mod
        spec.loader.exec_module(mod)

from backend.api.main import app

__all__ = ["app"]
