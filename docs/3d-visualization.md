# LUNARIS 3D visualization

All three planned phases are implemented in Mission Details and Compare.
Run `npm ci` and `npm run dev` from `frontend/` within the complete repository.
The committed `frontend/dist/` is rebuilt from the same source.

## Visual options

Open **Visual options** under the mission-time controls. Preferences persist
in local storage across navigation and reloads; browsers that block storage
still have working session controls.

- **Scientific:** clear day/night boundary, night highlighting, high contrast,
  site markers, local axes and direction lines. Decorative effects are off.
- **Cinematic:** Sun glow, Earth rim glow and HDR bloom; guides are hidden.
- Changing an individual option makes the view **Custom**. Reset restores
  the scientific preset. Master glow can be disabled without changing the
  boundary, night mask or scientific readouts.

Individual controls cover Sun/Earth bodies, site markers, direction lines,
local X/East Y/North Z/Up axes, the day/night boundary, night highlighting,
strong contrast, optional night hatching, Sun glow, Earth glow and soft bloom.
Hatching requires night highlighting. Glow options require visible bodies and
the master glow switch. A hidden body does not remove the physical sunlight
direction. Hide bodies and direction lines for a closer view of the Moon;
camera fitting follows the currently visible objects and guides.

## Day and night

The spherical lighting test is the dot product of the Moon-fixed scene surface
direction and the Sun direction. Positive values face the Sun. Negative values
form the night hemisphere. The terminator is the great circle perpendicular to
that same Sun direction. All three are fixed to lunar coordinates rather than
the camera. The selected UTC date, time and playback determine the Sun vector.

The night mask is a translucent, optional global overlay; high contrast also
reduces ambient fill light. Hatching is locked to the lunar scene surface.
The boundary and mask are depth tested, so they do not draw through the Moon.
The legend shows enabled layers and the current UTC instant.

This is global day/night separation, not a per-crater terrain-shadow simulation.
Terrain-aware visibility remains available through supported backend presets.
The Sun direction reconstructed from a site's API azimuth/elevation is used as
parallel global lighting, appropriate to this schematic visualization; it is
not an operationally validated lighting product.

## Optional effects

The Sun and Earth remain sphere meshes. Optional three-dimensional rim shells
and an HDR bloom pass provide the cinematic treatment. Bloom is mounted only
when glow is enabled for a visible body. Scientific mode renders without that
pass. The effects change presentation only; API results, local ephemeris,
directions, visibility windows and summary metrics are not modified.
Bloom uses an HDR-capable WebGL context and ACES output tone mapping. On devices
without HDR render targets, the simpler rim-glow effects remain available.

The project pins `@react-three/postprocessing` 2.19.1 for its React 18/Fiber 8
compatibility, with `postprocessing` 6.36.7 for Three.js 0.170. No new backend
dependency is needed.

## Validation

- `npm run test:api`: frontend API, ephemeris, coordinate registration,
  picking, camera fitting, terminator, day/night classification and preference
  persistence/gating tests.
- `npm run test:shaders`: optional Python 3 + Linux Mesa EGL check. Compiles the
  actual app Sun, night-mask and glow shaders, and renders an offscreen sphere.
  Tests eight real ephemeris/date/camera cases against Three.js reference rays
  (868 day/night pixel checks), plus hatching and rim-glow output. Three.js
  shader chunks are expanded for a linear offscreen render target.
- `npm run build`: production compilation and asset refresh.
- `python -m pytest tests/ -q`: existing backend regression suite.

The cloud preview browser used for this change has WebGL disabled. Browser
controls and persistence can be checked there, while its 3D canvas displays a
clear fallback. Native shader/pixel checks passed; a complete browser GPU
rendering check remains a local verification step.

See [Phase 1 details](phase1-3d.md) for the registered NASA Moon frame and
offline ephemeris pipeline. Image credits are in
`frontend/public/assets/CREDITS.md`.
