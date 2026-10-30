import glob
import json
import numpy as np
import rasterio
import matplotlib.pyplot as plt
import spiceypy as spice
from rasterio.crs import CRS
from rasterio.warp import transform as rtransform
from sunlib import FRAME          # importing sunlib also loads the kernels

# ---------- Choose the site (part of the DEM file name) ----------
SITE = "Site01"                   # use "Shoemaker" to redo Shoemaker

# ---------- Open the 5 m patch ----------
files = glob.glob(f"dem/*{SITE}*surf*")
print("Found:", files)
src = rasterio.open(files[0])
dem = src.read(1).astype(float)
if src.nodata is not None:
    dem[dem == src.nodata] = np.nan
px = src.transform.a
print("Size:", src.shape, " pixel (m):", px)

plt.imshow(dem, cmap="gray")
plt.title(f"{SITE} terrain patch (close this window to continue)")
plt.colorbar(label="Height (m)")
plt.show()

MOON_GEO = CRS.from_proj4("+proj=longlat +R=1737400 +no_defs")
max_km = src.width * px / 2000 * 0.9      # stop at the patch edge

# ---------- Sun positions: one year, hourly, computed once ----------
t0 = spice.str2et("2026-11-14 12:00:00")
ets = t0 + 3600 * np.arange(0, 365 * 24)
SUN = np.array([spice.spkpos("SUN", t, FRAME, "LT+S", "MOON")[0] for t in ets])

def sun_series(lat_deg, lon_deg):
    """Sun elevation, azimuth (deg) and distance (km) for every hour."""
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat)])
    v = SUN - 1737.4 * up
    dist = np.linalg.norm(v, axis=1)
    el = np.degrees(np.arcsin((v @ up) / dist))
    az = np.degrees(np.arctan2(v @ east, v @ north)) % 360
    return el, az, dist

# ---------- Horizon scan ----------
def horizon_profile(row, col, lon_deg, obs_h=2.0, R=1737400.0):
    z0 = dem[row, col] + obs_h
    d = np.arange(px, max_km * 1000, px)
    prof = np.full(360, -90.0)
    for i in range(360):
        a = np.radians(i + lon_deg)       # compass azimuth + longitude = map angle
        r = np.round(row - np.cos(a) * d / px).astype(int)
        c = np.round(col + np.sin(a) * d / px).astype(int)
        ok = (r >= 0) & (r < dem.shape[0]) & (c >= 0) & (c < dem.shape[1])
        ang = np.degrees(np.arctan2(dem[r[ok], c[ok]] - z0 - d[ok]**2 / (2 * R), d[ok]))
        ang = ang[np.isfinite(ang)]
        if ang.size:
            prof[i] = max(-90.0, ang.max())
    return prof

def longest_run(mask):
    best = cur = 0
    for m in mask:
        cur = cur + 1 if m else 0
        best = max(best, cur)
    return best

# ---------- Analyse one pixel ----------
def analyse(row, col, label, plot=False):
    x, y = src.xy(row, col)
    lons, lats = rtransform(src.crs, MOON_GEO, [x], [y])
    lat, lon = float(lats[0]), float(lons[0])
    p = horizon_profile(row, col, lon)

    el, az, dist = sun_series(lat, lon)
    r = np.degrees(np.arcsin(696000 / dist))                 # Sun's angular radius
    h = np.interp(az, np.arange(360), p, period=360)         # horizon toward the Sun
    frac = np.clip((el - h + r) / (2 * r), 0, 1)             # 0 = hidden, 1 = fully visible

    stats = {
        "lit_percent_point_sun": round(100 * float(np.mean(el > h)), 1),
        "lit_percent_with_sun_disk": round(100 * float(np.mean(frac)), 1),
        "lit_percent_if_flat": round(100 * float(np.mean(el > 0)), 1),
        "longest_dark_hours": int(longest_run(frac == 0)),
    }
    print(f"{SITE} {label} (lat {lat:.3f}, lon {lon:.3f}, height {dem[row, col]:.0f} m):", stats)

    if plot:
        plt.plot(range(360), p)
        plt.xlabel("Azimuth (deg)")
        plt.ylabel("Horizon elevation (deg)")
        plt.title(f"Horizon: {SITE} {label}")
        plt.show()
        n = 30 * 24
        plt.plot(np.arange(n) / 24, el[:n], label="Sun elevation")
        plt.plot(np.arange(n) / 24, h[:n], label="Terrain horizon toward the Sun")
        plt.xlabel("Days from start")
        plt.ylabel("Degrees")
        plt.legend()
        plt.title(f"{SITE} {label}")
        plt.show()

    out = {"name": f"{SITE} {label}", "lat": lat, "lon": lon, "obs_height_m": 2.0,
           "horizon_deg": [round(float(v), 2) for v in p], "stats_one_year": stats}
    json.dump(out, open(f"horizon_{SITE}_{label.replace(' ', '_')}.json", "w"))

# ---------- Run it on three points ----------
analyse(src.height // 2, src.width // 2, "center", plot=True)
analyse(*np.unravel_index(np.nanargmin(dem), dem.shape), "lowest point")
analyse(*np.unravel_index(np.nanargmax(dem), dem.shape), "highest point")
print("Saved 3 JSON files for", SITE)
