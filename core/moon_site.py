import glob
import numpy as np
import spicepy as spice
import matplotlib.pyplot as plt

# Setup 
for f in glob.glob("kernels/*"):
    spice.furnsh(f)

MOON_RADIUS_KM = 1737.4
FRAME = "MOON_ME_DE440_ME421"   # if this errors, try "IAU_MOON"


# Core function 
def elevation_azimuth(target, lat_deg, lon_deg, utc):
    """Elevation and azimuth (degrees) of `target` ("SUN" or "EARTH")
    seen from a point on the Moon's surface at time `utc`."""
    et = spice.str2et(utc)
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)

    # Target position from the Moon's centre, in the Moon-fixed frame
    target_pos, _ = spice.spkpos(target, et, FRAME, "LT+S", "MOON")

    # Site position (sphere approximation, no terrain yet)
    site = MOON_RADIUS_KM * np.array([
        np.cos(lat) * np.cos(lon),
        np.cos(lat) * np.sin(lon),
        np.sin(lat),
    ])

    # Vector from site to target
    v = np.array(target_pos) - site

    # Local axes at the site: east, north, up
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([-np.sin(lat) * np.cos(lon),
                      -np.sin(lat) * np.sin(lon),
                      np.cos(lat)])
    up = np.array([np.cos(lat) * np.cos(lon),
                   np.cos(lat) * np.sin(lon),
                   np.sin(lat)])

    e, n, u = v @ east, v @ north, v @ up
    elevation = np.degrees(np.arcsin(u / np.linalg.norm(v)))
    azimuth = np.degrees(np.arctan2(e, n)) % 360
    return elevation, azimuth


# ---------- Test: one point, one date ----------
LAT, LON = 0.6741, 23.4730          # Apollo 11 site
DATE = "2026-11-14 12:00:00"

for body in ("SUN", "EARTH"):
    el, az = elevation_azimuth(body, LAT, LON, DATE)
    print(f"{body}: elevation {el:.2f} deg, azimuth {az:.2f} deg")


# ---------- Time series over one lunar day ----------
start = spice.str2et(DATE)
hours = np.arange(0, 30 * 24, 2)     # every 2 hours for 30 days
times = [spice.et2utc(start + h * 3600, "ISOC", 0) for h in hours]

sun_el = [elevation_azimuth("SUN", LAT, LON, t)[0] for t in times]
earth_el = [elevation_azimuth("EARTH", LAT, LON, t)[0] for t in times]

plt.plot(hours / 24, sun_el, label="Sun")
plt.plot(hours / 24, earth_el, label="Earth")
plt.axhline(0, color="gray")
plt.xlabel("Days from start")
plt.ylabel("Elevation (deg)")
plt.title("Sun and Earth elevation at the site")
plt.legend()
plt.show()
def find_events(target, lat, lon, start_utc, days=60, step_hours=1):
    """Find times when `target` crosses 0 deg elevation (rise or set)."""
    t0 = spice.str2et(start_utc)
    step = step_hours * 3600

    def el(et):
        return elevation_azimuth(target, lat, lon,
                                 spice.et2utc(et, "ISOC", 3))[0]

    events = []
    prev_et, prev_el = t0, el(t0)
    for i in range(1, int(days * 24 / step_hours) + 1):
        et = t0 + i * step
        e = el(et)
        if prev_el * e < 0:                      # sign change = crossing
            lo, hi = prev_et, et
            for _ in range(30):                  # bisection to refine
                mid = (lo + hi) / 2
                if el(lo) * el(mid) <= 0:
                    hi = mid
                else:
                    lo = mid
            kind = "RISE" if e > prev_el else "SET"
            events.append((kind, (lo + hi) / 2))
        prev_et, prev_el = et, e
    return events


print("\n--- Events (Sun) ---")
for kind, et in find_events("SUN", LAT, LON, DATE):
    hours = (et - spice.str2et(DATE)) / 3600
    print(f"Sun {kind}: {spice.et2utc(et, 'ISOC', 0)}  (in {hours:.1f} h)")

print("\n--- Events (Earth) ---")
for kind, et in find_events("EARTH", LAT, LON, DATE):
    print(f"Earth {kind}: {spice.et2utc(et, 'ISOC', 0)}")