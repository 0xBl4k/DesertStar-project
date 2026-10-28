"""Writes one JSON file per preset site into frontend/data/presets/.
Run from the repo root:  python -m precompute.build_presets
"""
import json
from datetime import datetime
from pathlib import Path

from core import horizon, sun_earth

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "frontend" / "data"
START, END, STEP_MIN = datetime(2027, 1, 1), datetime(2027, 3, 1), 60


def main():
    sites = json.loads((DATA / "sites.json").read_text())
    out = DATA / "presets"
    out.mkdir(exist_ok=True)
    for s in sites:
        prof = horizon.profile(s["lat"], s["lon"])
        result = sun_earth.build_samples(s["lat"], s["lon"], START, END, STEP_MIN, prof)
        result.update({"site_id": s["id"], "name": s["name"]})
        (out / f"{s['id']}.json").write_text(json.dumps(result))
        print("wrote", s["id"])


if __name__ == "__main__":
    main()