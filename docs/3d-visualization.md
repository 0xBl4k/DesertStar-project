# LUNARIS Moon-centered visualization

The global scene is centered on the Moon. Sun/Earth placement, light direction,
the day/night boundary, axes and the camera orbit do not depend on a landing site.
Choosing a site changes its marker and visibility analysis only. The Moon stays
at the orbit pivot; bodies retain their three-dimensional NASA/SPICE directions.
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
retain their polar browsing orientation. Selecting another site does not refocus
or rotate the orbital camera. Camera fitting includes currently visible bodies,
atmosphere/glow shells, centered axes and rays, while preserving the Moon pivot.

Earth's center mainly librates in this Moon-fixed frame; it does not make an
invented large orbit around the Moon. Its surface attitude follows absolute UTC
using Greenwich apparent sidereal time and an IAU lunar attitude model. The
appearance model is separate from the authoritative DE440 position vectors.
Pausing, reversing the scrubber, or changing the start time does not accumulate
rotation drift.

## Moon lighting and terrain shadows

Parallel sunlight points from the Sun toward the Moon origin. The displayed
Sun position and light use the same centered direction. Optional 2048-pixel
soft shadow maps let the NASA LRO mesh cast and receive relief shadows.
These shadows show the resolution of the rendered model; they are not a
validated per-crater planning product.

The updated NASA LROC cylindrical map is projected by lunar longitude/latitude
onto the existing NASA mesh, independent of its cube-atlas UV layout. The source
geometry is preserved. If that mesh is unavailable, a sphere uses the same color
map plus displacement/bump detail derived from NASA's LOLA elevation map.

Night highlighting and optional hatching are applied inside the actual lunar
surface material. They retain dim texture detail on the night side and have a
narrow smooth day/night transition. The former floating spherical mask is no
longer drawn. The optional boundary line is a spherical reference great circle
perpendicular to the global Sun vector; detailed terrain shadows may differ
from that reference. Camera movement and site selection cannot move the boundary.

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

## Verification

- `npm run test:api`: frontend geometry, endpoint adaptation, independent site
  selection, frame validation, horizontal camera fitting, playback and preferences.
- `python -m pytest tests/ -q`: backend regression and new endpoint tests comparing
  global vectors with the same site's local visibility, fractional UTC and coverage.
- `npm run test:shaders`: optional Python 3, Pillow and Mesa EGL/OpenGL ES 3 check.
  Compiles the actual patched Three.js lunar material with and without soft
  shadows, plus Sun/cloud/atmosphere/glow and the shared night field. Renders the
  bundled NASA textures and checks illumination, hatching and known shadow-map
  occlusion. Also performs 868 day/night pixel checks over eight date/camera cases.
- `npm run build`: production compilation and committed asset refresh.

The cloud browser cannot start WebGL. The live frontend's connection to both
backend endpoints and playback through the final frame were checked there.
Complete browser rendering of the assembled 3D scene still needs a local browser
with WebGL; native material/shader/pixel checks pass independently.
