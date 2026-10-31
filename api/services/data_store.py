import json
from pathlib import Path
from functools import lru_cache

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
HORIZON_DIR = DATA_DIR / "horizons"


@lru_cache(maxsize=1)
def load_ephemeris() -> dict:
    path = DATA_DIR / "ephemeris.json"

    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    return data


@lru_cache(maxsize=16)
def load_horizon(site_id: str) -> dict:
    allowed_sites = {
        "center",
        "highest_point",
        "lowest_point",
        "shoemaker",
        "Site01_center",
        "Site01_highest_point",
        "Site01_lowest_point",
    }

    if site_id not in allowed_sites:
        raise ValueError("Unknown site ID")

    path = HORIZON_DIR / f"horizon_{site_id}.json"

    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    if len(data["horizon_deg"]) != 360:
        raise ValueError("Horizon must contain 360 values")

    return data
