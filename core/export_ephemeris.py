import json
import numpy as np
import spiceypy as spice
from sunlib import FRAME        # importing sunlib also loads the kernels

START_UTC = "2026-11-01 00:00:00"
DAYS = 365
STEP_S = 3600

t0 = spice.str2et(START_UTC)
ets = t0 + STEP_S * np.arange(DAYS * 24 + 1)

sun = np.array([spice.spkpos("SUN", t, FRAME, "LT+S", "MOON")[0] for t in ets])
earth = np.array([spice.spkpos("EARTH", t, FRAME, "LT+S", "MOON")[0] for t in ets])

data = {
    "start_utc": "2026-11-01T00:00:00",
    "step_s": STEP_S,
    "frame": FRAME,
    "units": "km, from the Moon's center, in the Moon-fixed frame",
    "sun_km": np.round(sun).astype(int).tolist(),
    "earth_km": np.round(earth, 1).tolist(),
}
json.dump(data, open("ephemeris.json", "w"), separators=(",", ":"))
print("Saved ephemeris.json with", len(ets), "hourly rows")