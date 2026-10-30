
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HORIZON_DIR = ROOT / "data" / "horizons"

ALLOWED_SITES = {
    "center": "horizon_center.json",
    "lowest_point": "horizon_lowest_point.json",
    "highest_point": "horizon_highest_point.json",
    "shoemaker": "horizon_shoemaker.json",
}


def get_horizon(site_id: str) -> dict:
    if site_id not in ALLOWED_SITES:
        raise ValueError("Unknown site ID")

    path = HORIZON_DIR / ALLOWED_SITES[site_id]

    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    if len(data["horizon_deg"]) != 360:
        raise ValueError("Invalid horizon profile")

    return data
