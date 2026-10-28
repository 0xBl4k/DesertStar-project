"""TERRAIN MATH currently ai made, u can change anytime but i added it as a test for my backend.

STUB: returns a flat fake horizon so the API works today.
Replace the body with real DEM ray-marching later. Keep the signature.
"""


def profile(lat: float, lon: float) -> list[float]:
    """Return 360 values: terrain elevation angle (deg) for azimuth 0..359."""
    return [0.5] * 360
