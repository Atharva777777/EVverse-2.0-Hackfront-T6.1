"""
EVision — FastAPI application entry point.

Local:
.venv/bin/uvicorn backend.api.main:app --reload --port 8000

Production:
uvicorn backend.api.main:app --host 0.0.0.0 --port $PORT
"""

from contextlib import asynccontextmanager
from pathlib import Path

try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).resolve().parents[2] / ".env"
    if _env_path.exists():
        load_dotenv(dotenv_path=_env_path, override=False)
    else:
        load_dotenv(override=False)
except ImportError:
    pass

import pandas as pd

# ---------------------------------------------------------------------------
# Pandas 3.x compatibility
# ---------------------------------------------------------------------------

try:
    pd.options.future.infer_string = False
except AttributeError:
    pass


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routers import health
from backend.api.routers import live_data
from backend.api.routers import driver
from backend.api.routers import trip
from backend.data.driver_db import init_driver_db


# ---------------------------------------------------------------------------
# Application lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Pre-warm the optimization pipeline and initialize driver database on startup.
    If warm-up fails, allow the API to start so health checks still work.
    """
    try:
        init_driver_db()
    except Exception as exc:
        print(f"[EVision] Driver DB init warning: {exc}")


    yield


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="EV Verse Spatial API",
    description="3D Urban Infrastructure Digital Twin & Spatial Planning Engine",
    version="2.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,

    # Production Vercel frontend
    allow_origins=[
        "https://quant-ev.vercel.app",
        "http://localhost:3000",
        "http://localhost:3001",
    ],

    # Also allow Vercel preview deployments.
    allow_origin_regex=r"https://.*\.vercel\.app",

    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# API routers
# ---------------------------------------------------------------------------

app.include_router(
    health.router,
    prefix="/api/v1",
    tags=["health"],
)

app.include_router(
    live_data.router,
    prefix="/api/v1",
    tags=["live-data"],
)

app.include_router(
    driver.router,
    prefix="/api/v1/driver",
    tags=["driver"],
)

app.include_router(
    trip.router,
    prefix="/api/v1/trip",
    tags=["trip"],
)