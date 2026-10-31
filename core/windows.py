import glob
import json
from pathlib import Path
from datetime import datetime, timedelta
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
eph = json.loads((ROOT / "data" / "ephemeris.json").read_text())

R_MOON = 1737.4
STEP_H = eph["step_s"] / 3600
START = datetime.fromisoformat(eph["start_utc"])
SUN = np.array(eph["sun_km"], dtype=float)
EARTH = np.array(eph["earth_km"], dtype=float)

def directions(vecs, lat_deg, lon_deg):
    """Elevation and azimuth (deg) of body vectors as seen from a lunar site."""
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat)])
    v = vecs - R_MOON * up
    dist = np.linalg.norm(v, axis=1)
    el = np.degrees(np.arcsin((v @ up) / dist))
    az = np.degrees(np.arctan2(v @ east, v @ north)) % 360
    return el, az

def margin(site, vecs):
    """Elevation minus terrain horizon in that direction. Above 0 = visible."""
    el, az = directions(vecs, site["lat"], site["lon"])
    h = np.interp(az, np.arange(360), site["horizon_deg"], period=360)
    return el - h

def crossings(m):
    """Times (hours since start) where visibility switches, and in which direction."""
    out = []
    for i in range(len(m) - 1):
        if (m[i] > 0) != (m[i + 1] > 0):
            t = (i + m[i] / (m[i] - m[i + 1])) * STEP_H
            out.append(("rise" if m[i + 1] > 0 else "set", t))
    return out

def longest_run(mask):
    best = cur = 0
    for x in mask:
        cur = cur + 1 if x else 0
        best = max(best, cur)
    return best * STEP_H

def when(h):
    return (START + timedelta(hours=h)).strftime("%Y-%m-%d %H:%M")

def report(path, now_utc):
    site = json.load(open(path))
    now_h = (datetime.fromisoformat(now_utc) - START).total_seconds() / 3600
    print(f"\n=== {site['name']} (lat {site['lat']:.3f}, lon {site['lon']:.3f}) at {now_utc} UTC ===")
    for name, vecs in (("Sun", SUN), ("Earth", EARTH)):
        m = margin(site, vecs)
        now_m = np.interp(now_h / STEP_H, np.arange(len(m)), m)
        state = "UP" if now_m > 0 else "DOWN"
        nxt = [e for e in crossings(m) if e[1] > now_h][:2]
        print(f"{name}: {state} now | visible {100*np.mean(m > 0):.1f}% of the year | "
              f"longest hidden stretch {longest_run(m <= 0):.0f} h")
        for kind, t in nxt:
            print(f"   next {name.lower()}{kind}: {when(t)} UTC  (in {t - now_h:.1f} h)")

if '__main__' == __name__:
    NOW = "2026-11-14T12:00:00"
    for f in sorted(glob.glob("horizon_*.json")):
        report(f, NOW)

    # ---------- Check: does the JSON pipeline match SPICE? ----------

    from sunlib import elevation_azimuth
    site = json.load(open("horizon_center.json"))
    h = 324.37                                    # an off-grid time, 22 min 12 s past the hour
    i = int(h); f = h - i
    v = SUN[i] * (1 - f) + SUN[i + 1] * f         # linear interpolation, as the web app will do
    el, az = directions(np.array([v]), site["lat"], site["lon"])
    utc = (START + timedelta(hours=h)).strftime("%Y-%m-%d %H:%M:%S")
    true_el, true_az = elevation_azimuth("SUN", site["lat"], site["lon"], utc)
    print(f"\nCheck vs SPICE at {utc}: elevation diff {abs(el[0] - true_el):.4f} deg, "
        f"azimuth diff {abs(az[0] - true_az):.4f} deg")

    # ---------- Sun AND Earth both up ----------
    for f in sorted(glob.glob("horizon_*.json")):
        site = json.load(open(f))
        ms, me = margin(site, SUN), margin(site, EARTH)
        both = (ms > 0) & (me > 0)
        print(f"{site['name']}: Sun and Earth both up {100*np.mean(both):.1f}% of the year, "
            f"longest stretch without both {longest_run(~both):.0f} h")