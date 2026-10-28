"""GEOMETRY MATH, currently ai made, u can change anytime but i added it as a test for my backend.

STUB: returns fake but correctly shaped data so the frontend can build against it.
Replace the body with real SPICE code later. Keep the signature and output shape.
"""
import math
from datetime import datetime, timedelta


def build_samples(lat: float, lon: float, start: datetime, end: datetime,
                  step_minutes: int, horizon: list[float]) -> dict:
    n = int((end - start).total_seconds() // (step_minutes * 60)) + 1
    samples = []
    sun_up = earth_up = 0
    for i in range(n):
        phase = 2 * math.pi * i * step_minutes / (29.5 * 24 * 60)
        sun_el = 4 * math.sin(phase)                 # FAKE
        earth_el = 6 * math.sin(phase / 2 + 1)       # FAKE
        sun_vis = sun_el > horizon[int((phase * 57.3) % 360)]
        earth_vis = earth_el > 0
        sun_up += sun_vis
        earth_up += earth_vis
        samples.append({
            "t": i,
            "sun": {"az": (phase * 57.3) % 360, "el": round(sun_el, 2),
                    "visible_frac": 1.0 if sun_vis else 0.0},
            "earth": {"az": 45.0, "el": round(earth_el, 2), "visible": earth_vis},
        })
    return {
        "lat": lat, "lon": lon,
        "start_utc": start.isoformat(), "step_minutes": step_minutes,
        "horizon": horizon,
        "samples": samples,
        "sun_windows": [], "earth_windows": [],      # TODO: compute from samples
        "summary": {"sun_pct": round(100 * sun_up / n, 1),
                    "earth_pct": round(100 * earth_up / n, 1),
                    "avg_sun_el_deg": 0.0, "longest_dark_hours": 0},
        "stub": True,                                 # remove when real math is in
    }
