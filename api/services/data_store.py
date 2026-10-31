"""Load and validate precomputed scientific data (no scientific calculations here)."""
import json
from datetime import datetime
from functools import lru_cache
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
HORIZON_DIR = DATA_DIR / "horizons"

ALLOWED_SITES = frozenset({
    "center", "highest_point", "lowest_point", "shoemaker",
    "Site01_center", "Site01_highest_point", "Site01_lowest_point",
})


class UnknownSiteError(ValueError):
    """A requested site is not in our supported preset catalog."""


class DataStoreError(RuntimeError):
    """Required precomputed scientific data is missing or invalid."""


def _read_json(path: Path, description: str):
    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise DataStoreError(f"{description} is missing or unreadable") from exc


@lru_cache(maxsize=1)
def load_ephemeris() -> dict:
    data = _read_json(DATA_DIR / "ephemeris.json", "Ephemeris")
    try:
        if not isinstance(data, dict):
            raise ValueError("Expected JSON object")
        datetime.fromisoformat(data["start_utc"].replace("Z", "+00:00"))
        step = data["step_s"]
        if isinstance(step, bool) or not isinstance(step, (int, float)) or not np.isfinite(step) or step <= 0:
            raise ValueError("step_s must be a positive number")
        if not isinstance(data["sun_km"], list) or not isinstance(data["earth_km"], list):
            raise ValueError("Missing vector arrays")
    except (KeyError, TypeError, ValueError, OverflowError) as exc:
        raise DataStoreError("Ephemeris metadata is invalid") from exc
    return data


@lru_cache(maxsize=16)
def load_horizon(site_id: str) -> dict:
    if site_id not in ALLOWED_SITES:
        raise UnknownSiteError("Unknown site ID")

    data = _read_json(HORIZON_DIR / f"horizon_{site_id}.json", "Horizon")
    try:
        if not isinstance(data, dict):
            raise ValueError("Expected JSON object")
        lat = float(data["lat"])
        lon = float(data["lon"])
        if not (np.isfinite(lat) and -90 <= lat <= 90 and np.isfinite(lon)):
            raise ValueError("Invalid site coordinates")
        horizon = np.asarray(data["horizon_deg"], dtype=float)
        if horizon.shape != (360,) or not np.all(np.isfinite(horizon)):
            raise ValueError("Horizon must contain 360 finite values")
        # core/terrain.py initializes empty directions to -90. Until the
        # science team provides valid data, do not silently claim visibility.
        if np.any(horizon == -90.0):
            raise ValueError("Horizon contains -90 missing-data sentinels")
    except (KeyError, TypeError, ValueError, OverflowError) as exc:
        raise DataStoreError("Horizon dataset is invalid or incomplete") from exc
    return data
