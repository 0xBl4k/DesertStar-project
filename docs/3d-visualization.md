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
strong contrast, optional night hatching, Sun glow, Earth glow and soft bloom. Earth also has independent blue-atmosphere
and cloud-layer controls, enabled by default in both presets. These do not require
decorative glow. Saved preferences from the earlier version retain their choices
and receive the new Earth-sky defaults.
Hatching requires night highlighting. Glow options require visible bodies and
the master glow switch. A hidden body does not remove the physical sunlight
direction. Hide bodies and direction lines for a closer view of the Moon;
camera fitting follows the currently visible objects and guides.

## Full lunar-cycle playback

Mission Details and Compare share a 709-hour timeline (~29.5 days), replacing
72 hours throughout the slider, backend request, comparison totals and progress
bars. One mean synodic cycle is 29.53059 days; the interval rounds upward to an
hour so hourly backend sampling covers the complete cycle and includes an exact
last sample. This is a fixed mean phase cycle, not a calculated new-Moon-to-new-Moon
event interval. The distinction from the ~27.3-day sidereal orbit is explained by
[NASA's Moon phases guide](https://science.nasa.gov/moon/moon-phases/).

The scrubber has weekly ticks, half-hour steps, replay from the end, and 1×/2×/4×
speeds. At 1×, the full interval takes about 90 seconds while the tab is active.
The start calendar ends on 2027-10-02; on that date the last start time is 11:00
UTC so the complete scenario fits the stored ephemeris ending 2027-11-01.
Selecting the last date clamps a later time; its time picker explains the limit.
A partial backend response is rejected instead of holding the last 72-hour
position through the remainder of the month. Offline scene geometry continues
to use the same full-year stored ephemeris.

## Earth motion and sky

Earth's center retains its topocentric SPICE-derived direction. In a Moon-fixed
scene it mainly librates near one direction, rather than making a large orbit
around the Moon. Its surface now rotates from absolute UTC. The Greenwich
meridian comes from apparent sidereal time and the equator-of-date-to-J2000
rotation; the scene orientation uses the IAU lunar body frame. The IAU attitude
model is for visual appearance and is separate from the authoritative DE440
position samples. Sun surface rotation uses the IAU model as well.

Scrubbing, changing dates, pausing, and resuming give the same orientation at
the same UTC instant. A thin blue atmosphere responds to the Sun direction;
a separate translucent cloud shell rotates with Earth plus slow illustrative
drift. The NASA Blue Marble surface remains unchanged. Clouds and solar
surface features are procedural illustrations, not date-specific weather or
solar observations. The Sun now has seamless cellular granulation, sunspots,
and limb darkening instead of the former low-resolution striped texture.

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
  persistence/gating tests, full-cycle coverage and endpoint tests, and Earth attitude checks against an independent Greenwich observer.
- `npm run test:shaders`: optional Python 3 + Linux Mesa EGL check. Compiles the
  actual app Sun, cloud, atmosphere, night-mask and glow shaders, and renders an offscreen sphere.
  Tests eight real ephemeris/date/camera cases against Three.js reference rays
  (868 day/night pixel checks), plus hatching, rim glow, solar surface variation, limb darkening, cloud coverage and Sun-responsive atmospheric output. Three.js
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
