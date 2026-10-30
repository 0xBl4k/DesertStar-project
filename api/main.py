import json
from pathlib import Path
from fastapi import FastAPI, HTTPException

from api.services.visibility import calculate_visibility
from api.schemas import VisibilityRequest

app = FastAPI(title="Lunar Site Api")

ROOT = Path(__file__).resolve().parent.parent
SITES_FILE = ROOT / "frontend" / "data" / "sites.json"

@app.get("/api/sites")
def get_sites():
    try:
        data = json.loads(SITES_FILE.read_text(encoding="utf-8"))
        return data
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="sites.json file not found.")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="sites.json contains invalid JSON data.")
    except OSError:
        raise HTTPException(status_code=500, detail="unable to read sites.json.")

@app.post("/api/visibility")
def calculate_visibility(request: VisibilityRequest):
    return calculate_visibility(request)