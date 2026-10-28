import json
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from core import horizon, sun_earth

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "frontend" / "data"
MAX_SAMPLES = 20_000

app = FastAPI(title="Lunar Planner API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],              # public API, no cookies, so no credentials
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class Query(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=360)
    start: datetime
    end: datetime
    step_minutes: int = Field(default=60, ge=10, le=1440)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/sites")
def sites():
    return json.loads((DATA / "sites.json").read_text())


@app.post("/api/visibility")
def visibility(q: Query):
    if q.end <= q.start:
        raise HTTPException(422, "end must be after start")
    n = (q.end - q.start).total_seconds() / (q.step_minutes * 60)
    if n > MAX_SAMPLES:
        raise HTTPException(422, f"too many samples ({int(n)}); max {MAX_SAMPLES}")
    prof = horizon.profile(q.lat, q.lon)
    return sun_earth.build_samples(q.lat, q.lon, q.start, q.end, q.step_minutes, prof)
