import ephemeris from '../../data/ephemeris.json' with {type: 'json'};
import {sceneGeometry, skyFromMoonFixedVectors} from './lunarSceneMath.js';

const HOUR_MS = 3600000;
const start = Date.parse(ephemeris.start_utc + (/Z$|[+-]\d\d:\d\d$/.test(ephemeris.start_utc) ? '' : 'Z'));
export const SCENE_COVERAGE_START = start;
export const SCENE_COVERAGE_END = start + (ephemeris.sun_km.length - 1) * ephemeris.step_s * 1000;

/** Stored SPICE data drives the 3D view offline; analysis still uses FastAPI.
 * No synthetic orbit, terrain classification or visibility metric is invented.
 */
export function ephemerisSkyAt(site, date, time, elapsedHours = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '') ||
      !Number.isFinite(elapsedHours)) return null;
  const base = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(base) || new Date(base).toISOString().slice(0, 16) !== `${date}T${time}`) return null;
  const timestamp = base + elapsedHours * HOUR_MS;
  if (timestamp < SCENE_COVERAGE_START || timestamp > SCENE_COVERAGE_END) return null;
  const index = (timestamp - start) / (ephemeris.step_s * 1000);
  const left = Math.floor(index), right = Math.min(left + 1, ephemeris.sun_km.length - 1);
  const fraction = index - left;
  const interpolate = values => values[left].map((v, i) => v + (values[right][i] - v) * fraction);
  return skyFromMoonFixedVectors(site, interpolate(ephemeris.sun_km), interpolate(ephemeris.earth_km));
}

/** The legend and canvas consume the same source decision. */
export function resolveLunarScene(site, apiSky, date, time, elapsedHours = 0) {
  const backend = sceneGeometry(site, apiSky);
  if (backend) return {source: 'backend', geometry: backend, sky: apiSky};
  const sky = ephemerisSkyAt(site, date, time, elapsedHours);
  const geometry = sceneGeometry(site, sky);
  return {source: geometry ? 'ephemeris' : 'unavailable', geometry, sky};
}
