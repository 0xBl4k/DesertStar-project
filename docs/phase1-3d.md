# Phase 1: coherent lunar 3D geometry

Run `npm ci` then `npm run dev` from `frontend/` in the complete repository.
The 3D Sun/Earth scene appears in Mission Details and Compare. Home and Search
remain Moon/location views. A selected location is used, or the first catalog
location when none has been chosen. Drag to orbit; double-click to fit the view.

## Data and UTC

The canvas uses valid current API azimuth/elevation samples first. When FastAPI
is unavailable, it interpolates the existing `data/ephemeris.json` Sun/Earth
Moon-fixed vectors and calculates the spherical topocentric directions using
the same 1737.4 km reference radius as `core/windows.py`.

This replaces the synthetic 72-hour repeating preview. UTC date, time and
fractional playback all describe the same instant. Coverage includes
2026-11-01 00:00 UTC through 2027-11-01 00:00 UTC. Invalid/out-of-coverage times
show an unavailable scene rather than invented celestial motion. The legend
identifies API versus local ephemeris data. Local scene data never fills in
terrain visibility, power, communications or summary metrics.

## Coordinate contract

Moon-fixed X points to latitude 0/longitude 0; Y to latitude 0/longitude 90E;
Z points north. The scene uses `(Moon Y, Moon X, -Moon Z)`, a proper rotation.
All geographic markers and surface picks use that convention on every page.
Local X/East, Y/North, Z/Up form a right-handed orthonormal frame at the site.

Direction rays start at the exact displayed marker. The Sun light uses the
displayed Sun position and targets that marker, preserving the same parallel
illumination direction across the Moon. Sun and Earth have schematic distances
and sizes; Earth surface rotation is decorative. They are actual sphere meshes
with depth/occlusion, not HTML body icons. The Sun uses generated surface detail
and limb shading; the Earth uses the credited NASA cylindrical color map.

Camera fitting includes the whole scene at the current orbit angle and canvas
aspect ratio. Bodies behind the Moon remain occluded until the camera is
rotated. Focusing a site rotates the camera around the scene instead of moving
it through the Moon; a manual drag cancels that focus transition.

## Registering the NASA model

Model: NASA GSFC https://svs.gsfc.nasa.gov/14959/ (`moon_small.glb`).
Expected Git blob SHA-1: `19bf19b7860edb5e3394bb51d96d5cf127656c9f`.

The native GLB has north along +Y, prime meridian along -Z and 90E along -X.
Its scene transform is therefore `(-native X, -native Z, -native Y)`.
The model is centered and normalized by maximum vertex radius so markers and
surface picking stay outside its mesh. The reference-sphere fallback uses the
same geographic registration with the NASA LROC map.

Registration was checked against the independent longitude/latitude LROC map
from https://svs.gsfc.nasa.gov/4720/. Sampling the embedded GLB texture at mesh
UVs and comparing to this map over all 48 signed axis permutations found the
best native-to-Moon-fixed mapping `(-Z, -X, +Y)`: luminance correlation 0.9829,
versus 0.4523 for the next candidate. Both the selected mapping and scene
transform preserve handedness. `scripts/verify-moon-frame.py` reproduces the
comparison (optional Python dependencies: numpy, Pillow; requires NASA access).

## Verification

`npm run test:api` checks the API adapter plus geographic picking round trips,
axis handedness, NASA registration anchors, real Three.js sphere UVs,
site-to-body ray directions, independent topocentric ephemeris calculations,
camera fitting across orbit angles/aspect ratios, API precedence, fractional
UTC playback, exact backend reference values and coverage endpoints.

`npm run build` refreshes the tracked production output in `frontend/dist`.
The existing backend suite runs with `python -m pytest tests/ -q` from the root.

The verification browser used for this change could not create a WebGL context.
Numerical tests and production compilation passed; actual GPU rendering and
interactive 3D camera behavior require a WebGL-enabled browser check. A canvas
error now leaves the rest of the application usable with a clear fallback.

Terminator overlays, stronger night highlighting, bloom and user effects
controls belong to the later phases.
