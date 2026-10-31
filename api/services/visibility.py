import numpy as np
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from api.schemas import VisibilityRequest
from api.services.data_store import load_ephemeris, load_horizon
from core.windows import directions


def calculate_visibility(request: VisibilityRequest) -> dict:

    eph = load_ephemeris()

    if request.mode == "preset":
        site = load_horizon(request.site_id)
        lat = site["lat"]
        lon = site["lon"]
    else:
        lat = request.lat
        lon = request.lon
    start = datetime.fromisoformat(eph["start_utc"]).replace(tzinfo=timezone.utc)
    step_s = eph["step_s"]
    sun_vectors = np.asarray(eph["sun_km"], dtype=float)
    earth_vectors = np.asarray(eph["earth_km"], dtype=float)

    if len(sun_vectors) != len(earth_vectors):
        raise HTTPException(500, "Invalid ephemeris data")
    
    coverage_end = start + timedelta(seconds=(len(sun_vectors) - 1) * step_s)
    if request.start_utc < start or request.end_utc > coverage_end:
        raise HTTPException(status_code=422, detail="Requested date outside ephemeris coverage")
    
    duration = (request.end_utc - request.start_utc).total_seconds()
    count = int(duration // (request.step_minutes * 60)) + 1

    indices = ((request.start_utc - start).total_seconds() + np.arange(count) * request.step_minutes * 60) / step_s

    left = np.floor(indices).astype(int)
    right = np.minimum(left + 1, len(sun_vectors) - 1)

    fraction = (indices - left)[:, None]

    sun = sun_vectors[left] * (1 - fraction) + sun_vectors[right] * fraction
    earth = earth_vectors[left] * (1 - fraction) + earth_vectors[right] * fraction

    sun_el, sun_az = directions(sun, lat, lon)
    earth_el, earth_az = directions(earth, lat, lon)
    return {
        "status": "geometry_only",
        "lat": lat,
        "lon": lon,
        "samples": [
            {
                "t": i * request.step_minutes,
                "sun": {
                    "el": float(sun_el[i]),
                    "az": float(sun_az[i])
                },
                "earth": {
                    "el": float(earth_el[i]),
                    "az": float(earth_az[i])
                }
            }
            for i in range(count)
        ]
    }
