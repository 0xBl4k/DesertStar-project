import json
import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.schemas import VisibilityRequest, EphemerisRequest
from api.services.data_store import DataStoreError, load_ephemeris, load_horizon
from api.services.visibility import calculate_visibility, calculate_ephemeris, cached_vectors

logger = logging.getLogger(__name__)

app = FastAPI(title="Lunar Site Api")

# Comma separated list of allowed frontend origins
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

ROOT = Path(__file__).resolve().parent.parent
SITES_FILE = ROOT / "frontend" / "data" / "sites.json"

@app.exception_handler(DataStoreError)
async def data_error_handler(request: Request, exc: DataStoreError):
    logger.error("Scientific data error at %s: %s", request.url.path, exc)
    return JSONResponse(status_code=503, content={"detail": str(exc)})

@app.get("/api/sites")
def get_sites():
    try:
        return json.loads(SITES_FILE.read_text(encoding="utf-8")) 
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="sites.json file not found.") from exc
    except (json.JSONDecodeError, UnicodeError, OSError) as exc:
        logger.error("Invalid site catalog: %s", exc)
        raise HTTPException(status_code=503, detail="Site catalog unavailable or invalid.") from exc

@app.post("/api/visibility")
def visibility_calculation(request: VisibilityRequest):
    return calculate_visibility(request)

@app.post("/api/ephemeris")
def scene_ephemeris(request: EphemerisRequest):
    return calculate_ephemeris(request)

@app.get("/health")
def health():
    return {"status":"ok"}

@app.get("/ready")
def ready():
    load_ephemeris()
    cached_vectors()
    load_horizon("Site01_highest_point")
    if not SITES_FILE.is_file():
        raise HTTPException(status_code=503, detail="Site catalog missing")
    return {"status":"ready"}
