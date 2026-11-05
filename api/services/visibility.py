from datetime import datetime, timezone, timedelta
from functools import lru_cache

import numpy as np
from fastapi import HTTPException

from api.schemas import VisibilityRequest, EphemerisRequest
from api.services.data_store import load_ephemeris, load_horizon, UnknownSiteError, DataStoreError
from core.windows import directions, margin, crossings


@lru_cache(maxsize=1)
def cached_vectors():
    """Parse the entire ephemeris into numpy arrays just once per API worker."""
    eph = load_ephemeris()
    try:
        sun = np.asarray(eph["sun_km"], dtype=float)
        earth = np.asarray(eph["earth_km"], dtype=float)
    except (ValueError, TypeError, KeyError) as exc:
        raise DataStoreError("Ephemeris vectors are invalid") from exc
    if (sun.ndim != 2 or sun.shape[1] != 3 or earth.shape != sun.shape
            or len(sun) < 2 or not np.isfinite(sun).all() or not np.isfinite(earth).all()):
        raise DataStoreError("Ephemeris vectors must be finite, aligned N×3 arrays")
    return sun, earth


def build_windows(site, vectors, data_start, request_start, request_end):
    """Convert teammate's rise/set events into intervals clipped to the request."""
    margins = margin(site, vectors)
    events = crossings(margins)
    windows = []
    opened = data_start if margins[0] > 0 else None

    def add_window(begin, end):
        if begin is None:
            return
        begin = max(begin, request_start)
        end = min(end, request_end)
        if begin < end:
            windows.append({"start": begin.isoformat(), "end": end.isoformat()})

    for kind, hours in events:
        event_time = data_start + timedelta(hours=float(hours))
        if kind == "rise":
            opened = event_time
        else:
            add_window(opened, event_time)
            opened = None
    if opened is not None:
        add_window(opened, request_end)
    return windows


def build_summary(start, end, sun_windows, earth_windows, sun_el):
    total_hours = (end - start).total_seconds() / 3600

    def window_hours(windows):
        return sum(
            (datetime.fromisoformat(w["end"]) - datetime.fromisoformat(w["start"])).total_seconds() / 3600
            for w in windows
        )

    sun_hours = window_hours(sun_windows)
    earth_hours = window_hours(earth_windows)
    cursor = start
    longest_dark = 0.0
    for window in sun_windows:
        begin = datetime.fromisoformat(window["start"])
        finish = datetime.fromisoformat(window["end"])
        longest_dark = max(longest_dark, (begin - cursor).total_seconds() / 3600)
        cursor = max(cursor, finish)
    longest_dark = max(longest_dark, (end - cursor).total_seconds() / 3600)
    return {
        "sun_pct": round(100 * sun_hours / total_hours, 2),
        "earth_pct": round(100 * earth_hours / total_hours, 2),
        "avg_sun_el_deg": round(float(np.mean(sun_el)), 3),
        "longest_dark_hours": round(longest_dark, 2),
    }


def sampled_vectors(request: EphemerisRequest):
    """One interpolation path for centered 3D positions and site visibility."""
    eph = load_ephemeris()
    start = datetime.fromisoformat(eph["start_utc"].replace("Z", "+00:00"))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    else:
        start = start.astimezone(timezone.utc)
    step_s = eph["step_s"]
    sun_vectors, earth_vectors = cached_vectors()
    coverage_end = start + timedelta(seconds=(len(sun_vectors) - 1) * step_s)
    if request.start_utc < start or request.end_utc > coverage_end:
        raise HTTPException(status_code=422, detail="Requested date outside ephemeris coverage")

    count = int((request.end_utc - request.start_utc).total_seconds() // (request.step_minutes * 60)) + 1
    indices = (
        (request.start_utc - start).total_seconds()
        + np.arange(count) * request.step_minutes * 60
    ) / step_s
    left = np.floor(indices).astype(int)
    right = np.minimum(left + 1, len(sun_vectors) - 1)
    fraction = (indices - left)[:, None]
    sun = sun_vectors[left] * (1 - fraction) + sun_vectors[right] * fraction
    earth = earth_vectors[left] * (1 - fraction) + earth_vectors[right] * fraction

    return eph, start, sun_vectors, earth_vectors, sun, earth


def calculate_ephemeris(request: EphemerisRequest) -> dict:
    eph, _, _, _, sun, earth = sampled_vectors(request)
    if eph.get("frame") != "MOON_ME_DE440_ME421":
        raise DataStoreError("Unsupported Moon-centered ephemeris frame")
    return {
        "origin": "MOON",
        "frame": eph.get("frame"),
        "units": "km",
        "source": "NASA/JPL NAIF SPICE (bundled ephemeris)",
        "start_utc": request.start_utc.isoformat(),
        "end_utc": request.end_utc.isoformat(),
        "step_minutes": request.step_minutes,
        "samples": [{"t": i * request.step_minutes,
                     "sun_km": sun[i].tolist(), "earth_km": earth[i].tolist()}
                    for i in range(len(sun))],
    }


def calculate_visibility(request: VisibilityRequest) -> dict:
    if request.mode == "preset":
        try:
            site = load_horizon(request.site_id)
        except UnknownSiteError as exc:
            raise HTTPException(status_code=404, detail="Unknown site ID") from exc
        lat, lon = site["lat"], site["lon"]
    else:
        lat, lon = request.lat, request.lon

    eph, start, sun_vectors, earth_vectors, sun, earth = sampled_vectors(request)
    count = len(sun)
    step_s = eph["step_s"]

    sun_el, sun_az = directions(sun, lat, lon)
    earth_el, earth_az = directions(earth, lat, lon)

    if request.mode == "preset":
        sun_visible = margin(site, sun) > 0
        earth_visible = margin(site, earth) > 0
        # Use just the hourly samples bracketing requested times for crossings().
        # crossings() uses core.windows.STEP_H, which is derived from step_s.
        first = max(0, int(np.floor((request.start_utc - start).total_seconds() / step_s)))
        last = min(len(sun_vectors) - 1,
                   int(np.ceil((request.end_utc - start).total_seconds() / step_s)))
        window_start = start + timedelta(seconds=first * step_s)
        sun_windows = build_windows(site, sun_vectors[first:last + 1], window_start,
                                    request.start_utc, request.end_utc)
        earth_windows = build_windows(site, earth_vectors[first:last + 1], window_start,
                                      request.start_utc, request.end_utc)
        summary = build_summary(request.start_utc, request.end_utc, sun_windows, earth_windows, sun_el)
    else:
        sun_windows = earth_windows = summary = None

    samples = []
    for i in range(count):
        sample = {
            "t": i * request.step_minutes,
            "sun": {"el": float(sun_el[i]), "az": float(sun_az[i])},
            "earth": {"el": float(earth_el[i]), "az": float(earth_az[i])},
        }
        if request.mode == "preset":
            sample["sun"]["visible"] = bool(sun_visible[i])
            sample["earth"]["visible"] = bool(earth_visible[i])
        samples.append(sample)

    return {
        "status": "terrain_visibility" if request.mode == "preset" else "geometry_only",
        "site_id": request.site_id,
        "lat": lat,
        "lon": lon,
        "horizon": site["horizon_deg"] if request.mode == "preset" else None,
        "sun_windows": sun_windows,
        "earth_windows": earth_windows,
        "summary": summary,
        "start_utc": request.start_utc.isoformat(),
        "step_minutes": request.step_minutes,
        "samples": samples,
    }
