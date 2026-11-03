/**
 * Convert DesertStar's lunar azimuth/elevation into a coherent 3D scene.
 *
 * Backend core/windows.py uses Moon-fixed Cartesian axes:
 *   X: latitude 0, longitude 0; Y: latitude 0, longitude +90; Z: north pole.
 *
 * LUNARIS's south-pole-facing scene uses a right-handed rotation:
 *   world X = Moon Y, world Y = Moon X, world Z = -Moon Z.
 * This also matches the existing moon-surface click inverse in App.jsx.
 *
 * This is an orientation convention for a schematic scene. The NASA GLB's
 * actual texture/body frame has NOT been independently registered to it.
 */
export const MOON_SCENE_RADIUS = 1.96;
const radians = degrees => degrees * Math.PI / 180;

const scale = (v, k) => v.map(x => x * k);
const add = (a, b) => a.map((v, i) => v + b[i]);
const normalized = v => {
  const length = Math.hypot(...v);
  return length > 0 ? v.map(x => x / length) : null;
};

export function localFrame(latDeg, lonDeg) {
  const lat = radians(latDeg), lon = radians(lonDeg);
  const cLat = Math.cos(lat), sLat = Math.sin(lat);
  const cLon = Math.cos(lon), sLon = Math.sin(lon);
  const up = [cLat * sLon, cLat * cLon, -sLat];
  const east = [cLon, -sLon, 0];
  const north = [-sLat * sLon, -sLat * cLon, -cLat];
  return {east, north, up};
}

export function siteSurfacePosition(latDeg, lonDeg, radius = MOON_SCENE_RADIUS) {
  return scale(localFrame(latDeg, lonDeg).up, radius);
}

/** Azimuth clockwise from local north through east; elevation above local up horizon. */
export function directionFromAzEl(latDeg, lonDeg, azDeg, elDeg) {
  const {east, north, up} = localFrame(latDeg, lonDeg);
  const az = radians(azDeg), el = radians(elDeg);
  const e = Math.cos(el) * Math.sin(az);
  const n = Math.cos(el) * Math.cos(az);
  const u = Math.sin(el);
  return normalized(add(add(scale(east, e), scale(north, n)), scale(up, u)));
}

/** 3D bodies have SCHEMATIC distances/sizes; directions come from FastAPI. */
export function sceneGeometry(site, sky, {
  sunDistance = 2.8, earthDistance = 2.5, radius = MOON_SCENE_RADIUS,
} = {}) {
  if (!site || !sky || ![site.lat, site.lon,
    sky.sun?.azimuth, sky.sun?.altitude,
    sky.earth?.azimuth, sky.earth?.altitude,
    sunDistance, earthDistance, radius].every(Number.isFinite)) return null;
  if (site.lat < -90 || site.lat > 90 || radius <= 0 || sunDistance <= 0 || earthDistance <= 0) return null;
  const surface = siteSurfacePosition(site.lat, site.lon, radius);
  const marker = siteSurfacePosition(site.lat, site.lon, radius + 0.03);
  const frame = localFrame(site.lat, site.lon);
  const sunDirection = directionFromAzEl(site.lat, site.lon, sky.sun.azimuth, sky.sun.altitude);
  const earthDirection = directionFromAzEl(site.lat, site.lon, sky.earth.azimuth, sky.earth.altitude);
  return {
    surface, marker, frame, sunDirection, earthDirection,
    sunPosition: add(surface, scale(sunDirection, sunDistance)),
    earthPosition: add(surface, scale(earthDirection, earthDistance)),
  };
}


/**
 * Frontend-only preview when FastAPI is unavailable.
 * These coordinates are intentionally illustrative, NOT astronomical predictions.
 * They move with the UTC date/time and playback slider so 3D rendering can be
 * inspected without a backend. Never use these values in scientific metrics.
 */
export function previewSkyAt(date = '2026-11-24', time = '12:00', elapsedHours = 0) {
  const timestamp = Date.parse(`${date}T${time}:00Z`);
  const hours = (Number.isFinite(timestamp) ? timestamp / 3600000 : 0) +
    (Number.isFinite(elapsedHours) ? elapsedHours : 0);
  const phase = ((hours % 72) + 72) % 72 * 2 * Math.PI / 72;
  return {
    sun: {azimuth: 95 + 15 * Math.sin(phase), altitude: 18 + 9 * Math.cos(phase)},
    earth: {azimuth: 275 + 15 * Math.cos(phase), altitude: 10 + 4 * Math.sin(phase)},
  };
}
