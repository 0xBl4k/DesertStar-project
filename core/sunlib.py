import glob
import numpy as np
import spiceypy as spice

for f in glob.glob("kernels/*"):
    spice.furnsh(f)

MOON_RADIUS_KM = 1737.4
FRAME = "MOON_ME_DE440_ME421"

def elevation_azimuth(target, lat_deg, lon_deg, utc):
    et = spice.str2et(utc)
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    target_pos, _ = spice.spkpos(target, et, FRAME, "LT+S", "MOON")
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    site = MOON_RADIUS_KM * up
    v = np.array(target_pos) - site
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat)])
    e, n, u = v @ east, v @ north, v @ up
    elevation = np.degrees(np.arcsin(u / np.linalg.norm(v)))
    azimuth = np.degrees(np.arctan2(e, n)) % 360
    return elevation, azimuth