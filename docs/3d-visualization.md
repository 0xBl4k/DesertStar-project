# LUNARIS Moon-centered visualization

The global scene is centered on the Moon. Sun/Earth placement, light direction,
the day/night boundary and axes do not depend on a landing site.
Choosing a site changes its marker and visibility analysis; Moon-lock mode can
also turn the camera toward it. Bodies retain their three-dimensional NASA/SPICE directions.
Their displayed sizes and distances remain schematic.

## Backend connection

Run the backend from the repository root with the existing Python environment:

```bash
uvicorn api.main:app --reload
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Restart both processes after pulling this update. The frontend uses two endpoints:

| Endpoint | Inputs | Purpose |
| --- | --- | --- |
| `POST /api/ephemeris` | UTC start/end, step_minutes | Site-independent Moon-centered Sun/Earth vectors in kilometers |
| `POST /api/visibility` | Same window plus preset or custom site | Local azimuth/elevation, terrain windows for supported presets, or geometric analysis |

Both endpoints use the same validated time range and interpolation of the bundled
NASA/JPL NAIF SPICE samples. The global response declares origin `MOON`, frame
`MOON_ME_DE440_ME421`, units `km`, UTC timestamps and samples with `t`, `sun_km`
and `earth_km`. The frontend rejects incompatible frames, zero/nonfinite vectors,
missing samples or mismatched time ranges. No site azimuth/elevation is used to
place the global bodies. Global requests are cached by UTC window, independently
of the selected site; playback reads the local response without per-frame requests.

Vite forwards `/api`, `/health` and `/ready` to `http://127.0.0.1:8000` by default.
Set `VITE_DEV_API_TARGET` for a different development backend. Production builds
use `VITE_API_URL` when the backend is hosted at another origin; configure the
backend's `CORS_ORIGINS` accordingly.

When the scene endpoint is unavailable, the exact same bundled NASA/SPICE vector
file drives the centered visualization, with its local-data source shown in the
legend. Visibility readouts remain unavailable if their backend request fails.
The client never invents terrain visibility to fill a missing response.

## Horizontal view and geographic frame

The registered internal scene frame is unchanged: Moon-fixed `(X,Y,Z)` maps to
scene `(Y,X,-Z)`. Geographic picking and marker placement still round-trip.
The orbital view now uses lunar north `(0,0,-1)` as camera up, with an oblique,
near-equatorial initial angle. This spreads the orbital plane horizontally
without flattening the true Z coordinates. Surface-browsing Home/Search views
retain their initial polar browsing orientation. Geometry remains Moon-centered
under either camera focus setting.

The camera toolbar offers **Lock on Moon** (checked) or **Whole system focus**
(unchecked). Moon lock orbits the lunar center and frames only the Moon; the
system setting follows the visible scene bounding-box center. Wheel/pinch and
zoom buttons work in either setting, down to just outside the lunar surface and
out to 160 scene units. Ordinary playback preserves the user's orbit and zoom.
Fit happens on initial load, a scope change, resize, or an explicit Fit command;
selecting a new location refocuses only while Moon lock is enabled.

**Show site** enables Moon lock and turns toward the selected coordinate. The
selected marker uses a persistent ring and name label, with a constant pixel size
through zoom. Markers are raycast onto the actual NASA relief. Labels remain
visible while the coordinate faces the camera; far-side markers stay occluded.
The selected name and Show site control remain available even on the far side.
Camera scope persists through navigation/reload and appearance preset changes.

Earth's center mainly librates in this Moon-fixed frame; it does not make an
invented large orbit around the Moon. Its surface attitude follows absolute UTC
using Greenwich apparent sidereal time and an IAU lunar attitude model. The
appearance model is separate from the authoritative DE440 position vectors.
Pausing, reversing the scrubber, or changing the start time does not accumulate
rotation drift.

## Moon lighting and terrain shadows

Parallel sunlight points from the Sun toward the Moon origin. The displayed
Sun position and light use the same centered direction. Filtered 4096-pixel
shadow maps (2048 on smaller GPUs), a tighter light-camera depth range and tuned
depth bias let the NASA LRO mesh cast and receive relief shadows. Smooth normals
are reconstructed across its split face/UV vertices without moving any terrain
vertices or changing triangle boundaries. The day/night shader also uses screen
derivatives to antialias the narrow transition.
These shadows show the resolution of the rendered model; they are not a
validated per-crater planning product.

The updated NASA LROC cylindrical map is projected by lunar longitude/latitude
onto the existing NASA mesh, independent of its cube-atlas UV layout. The source
geometry is preserved. The scene now uses the 4096x2048 NASA 2025 color map,
converted from the original 16-bit TIFF. Analytical longitude/latitude texture
gradients prevent the wrap seam from selecting an excessively blurred mip level.
This fixes a reproducible vertical stripe without hiding it with another overlay.
NASA's lower-resolution polar fill and finite global map resolution still limit
close-up detail, especially around the south-pole sites.
If the mesh is unavailable, a sphere uses the same color
map plus displacement/bump detail derived from NASA's LOLA elevation map.

Night highlighting and optional hatching are applied inside the actual lunar
surface material. They retain dim texture detail on the night side and have a
narrow smooth day/night transition. The former floating spherical mask is no
longer drawn. The optional boundary line is a spherical reference great circle
perpendicular to the global Sun vector; detailed terrain shadows may differ
from that reference. Camera movement and site selection cannot move the boundary.

## Resizable site window and collapsible menus

Drag the selected-site window’s right edge to resize its width, or its lower-right
corner to resize both width and height. Focus either handle and use arrow keys
(Shift for larger steps); Home or the reset button restores automatic sizing.
The panel leaves room for the Moon and clamps saved dimensions when the viewport
shrinks. Narrow screens stack the window above the scene and retain height resizing.
Contents scroll within the window, so making it smaller does not lose the tabs or
Add to Compare action. Window dimensions persist across site changes and reloads.

Three-line buttons collapse and restore the selected-site window, Locations menu,
scene guide, and mission controls. Their expanded state persists independently.
The main navigation also has a working three-line toggle on desktop and mobile.
Collapsing a panel does not reset its controls, selected site or playback.

## NASA imagery and provenance

All visible celestial surface maps are NASA-derived:

- Moon: updated 2025 LROC color map from the [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/),
  and the existing [NASA LRO topographic mesh](https://svs.gsfc.nasa.gov/14959/).
- Fallback terrain: LOLA `ldem_4.tif`, converted to display displacement. The
  compact 8-bit map has about 76 m vertical quantization and 4 pixels/degree;
  it does not substitute for the backend's local horizon profiles.
- Earth: [NASA Blue Marble](https://svs.gsfc.nasa.gov/2915/) surface mosaic and
  [Blue Marble cloud composite](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/).
  The original NASA EO cloud server returned HTTP 503; its archival NASA image
  was retrieved from Penn State's educational mirror, recorded in the manifest.
- Sun: [NASA JPL SDO/STEREO 304-angstrom full-surface map](https://svs.gsfc.nasa.gov/30362/).
  This is historical 2012 false-color EUV imagery, replacing the procedural Sun.

Maps are historical visual textures, not observations at the selected 2026/2027
instant. Cloud drift, atmospheric scattering and glow are rendering effects.
`frontend/public/assets/CREDITS.md` and `nasa-sources.json` record credits,
source URLs, original/download checksums, the cloud mirror and all conversions.
No third-party texture packs or generated surface imagery are used by the scene.
The assets are committed for offline use; NASA servers are not contacted per frame.

## Playback and preferences

Mission Details and Compare share a 709-hour (~29.5-day) mean phase-cycle window,
with 710 hourly backend samples and half-hour scrubber steps. Weekly ticks,
replay from the end, and 1×/2×/4× speeds are available. One active 1× playback
lasts about 90 seconds. The final start is 2027-10-02 11:00 UTC, so the full
window fits the ephemeris ending 2027-11-01. The calendar/time picker applies
that limit. This mean window is not an event-to-event new-Moon prediction.

Scientific/Cinematic presets and individual controls persist across navigation
and reloads. Terrain relief shadows, day/night highlighting, boundary, hatching,
Moon-centered axes, direction rays, markers, body visibility, Earth atmosphere,
clouds and decorative glow/bloom can be controlled independently. Bloom requires
supported HDR render targets; the simpler appearance remains available otherwise.

## Independent astronomical comparison

The scene is a directionally accurate schematic, not a photograph or a true-scale
solar-system model. The UI explicitly labels the adjusted sizes/distances, shows
Moon-to-Sun and Moon-to-Earth distances in kilometers, and distinguishes a live
backend response from bundled fallback data. Local visibility has a separate
backend terrain/geometry status. Sun imagery is historical false-color EUV;
Earth clouds are a historical composite with illustrative drift.

A fresh NASA/JPL SPICE recomputation used DE440s, the DE440 lunar binary PCK,
DE440 mean-Earth frame kernel and leap-second kernel. It compared every hourly
sample and half-hour midpoint from 2026-11-01 through 2027-11-01: **17,521
timestamps per body**. Results and kernel/source SHA-256 hashes are in
[`ephemeris-spice-audit.json`](ephemeris-spice-audit.json).

| Body | Maximum direction difference | Maximum vector difference |
| --- | --- | --- |
| Sun | 0.00001549 degrees | 1,502.91 km |
| Earth | 0.00014129 degrees | 0.924 km |

The larger solar distance error comes mainly from the chord of hourly linear
interpolation across a roughly 150-million-kilometer vector; angular error is
small. This is a sampled validation, not a bound for all instants or a validation
of local terrain products. To reproduce it, install optional `numpy`/`spiceypy`,
download the four kernels listed in the report into a directory, and run:

```bash
python scripts/verify_ephemeris_spice.py --kernel-dir /path/to/kernels --output docs/ephemeris-spice-audit.json
```

## Verification

- `npm run test:api`: frontend geometry, endpoint adaptation, independent site
  selection, frame validation, horizontal camera fitting, free-zoom triggers,
  marker anchoring/pixel size, original NASA terrain preservation, bounded panel
  resizing, playback and saved camera/preferences.
- `python -m pytest tests/ -q`: backend regression and new endpoint tests comparing
  global vectors with the same site's local visibility, fractional UTC and coverage.
- `npm run test:shaders`: optional Python 3, Pillow and Mesa EGL/OpenGL ES 3 check.
  Compiles the actual patched Three.js lunar material with and without soft
  shadows, plus Sun/cloud/atmosphere/glow and the shared night field. Renders the
  bundled NASA textures and checks illumination, hatching and known shadow-map
  occlusion. Also performs 868 day/night pixel checks over eight date/camera cases,
  plus a textured mipmap regression that fails with implicit derivatives at the
  longitude seam and passes with the analytical gradients.
- `npm run build`: production compilation and committed asset refresh.

The cloud browser cannot start WebGL. The live frontend's connection to both
backend endpoints and playback through the final frame were checked there.
Complete browser rendering of the assembled 3D scene still needs a local browser
with WebGL; native material/shader/pixel checks pass independently.
