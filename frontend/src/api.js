/** LUNARIS -> DesertStar FastAPI bridge.
 * API results (not Astronomy Engine guesses) are authoritative for displayed analysis.
 * Presets use terrain-aware science; arbitrary coordinates are geometry-only.
 */
const base = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '');
export const EPHEMERIS_BEGIN = Date.parse('2026-11-01T00:00:00Z');
export const EPHEMERIS_END = Date.parse('2027-11-01T00:00:00Z');
export const HOURS_PER_SCENARIO = 72;
const HOUR_MS = 3600000;
const cache = new Map();

export const emptyMetric = () => ({
  sun: {altitude: null, azimuth: null},
  earth: {altitude: null, azimuth: null},
  sunVisible: null, earthVisible: null,
  sunHours: null, earthHours: null, bothHours: null,
  incidence: null, mode: 'unavailable',
});

function detailOf(body, fallback) {
  if (typeof body?.detail === 'string') return body.detail;
  if (Array.isArray(body?.detail)) return body.detail.map(e => e.msg || JSON.stringify(e)).join('; ');
  return fallback;
}

export async function loadSiteCatalog() {
  const response = await fetch(`${base}/api/sites`);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(detailOf(json, `Site catalog HTTP ${response.status}`));
  return json;
}

export async function loadHealth() {
  const response = await fetch(`${base}/health`);
  if (!response.ok) throw new Error(`Backend health HTTP ${response.status}`);
  return response.json();
}

function buildRequest(site, date, time) {
  if (!site) throw new Error('Choose a landing site.');
  const stamp = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(stamp)) throw new Error('Enter a valid UTC date and time.');
  if (stamp < EPHEMERIS_BEGIN || stamp + HOURS_PER_SCENARIO * HOUR_MS > EPHEMERIS_END) {
    throw new Error('A 72-hour analysis must fit between 2026-11-01 and 2027-11-01 UTC.');
  }
  const payload = {
    start_utc: new Date(stamp).toISOString(),
    end_utc: new Date(stamp + HOURS_PER_SCENARIO * HOUR_MS).toISOString(),
    step_minutes: 60,
  };
  if (site.backendSiteId) {
    return {...payload, mode: 'preset', site_id: site.backendSiteId};
  }
  if (!Number.isFinite(site.lat) || !Number.isFinite(site.lon)) {
    throw new Error('Invalid lunar latitude or longitude.');
  }
  return {...payload, mode: 'custom', lat: site.lat, lon: site.lon};
}

export function scenarioKey(site, date, time) {
  return site ? `${site.backendSiteId || 'custom:' + site.lat + ':' + site.lon}|${date}|${time}` : '';
}

export function getScenario(site, date, time) {
  const key = scenarioKey(site, date, time);
  if (cache.has(key)) return cache.get(key);
  const pending = (async () => {
    const payload = buildRequest(site, date, time);
    const response = await fetch(`${base}/api/visibility`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(detailOf(json, `Visibility HTTP ${response.status}`));
    if (!Array.isArray(json.samples) || json.samples.length === 0) {
      throw new Error('Backend returned no position samples.');
    }
    return json;
  })();
  cache.set(key, pending);
  // Failed requests must be retried rather than cached forever.
  pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
  // Bound memory growth over many date/location combinations.
  if (cache.size > 48) cache.delete(cache.keys().next().value);
  return pending;
}

function hoursIn(windows) {
  if (!Array.isArray(windows)) return null;
  return windows.reduce((sum, w) => sum + Math.max(0, Date.parse(w.end) - Date.parse(w.start)) / HOUR_MS, 0);
}
function overlapHours(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  let result = 0;
  for (const x of a) for (const y of b) {
    result += Math.max(0, Math.min(Date.parse(x.end), Date.parse(y.end)) - Math.max(Date.parse(x.start), Date.parse(y.start))) / HOUR_MS;
  }
  return result;
}
function inWindows(windows, timestamp) {
  if (!Array.isArray(windows)) return null;
  return windows.some(w => timestamp >= Date.parse(w.start) && timestamp < Date.parse(w.end));
}
function lerpAzimuth(a, b, fraction) {
  return (a + (((b - a + 540) % 360) - 180) * fraction + 360) % 360;
}

/** Adapt API fields (el/az) to the original UI fields (altitude/azimuth).
 * The timeline is interpolated visually; science windows determine visibility.
 */
export function metricAt(result, elapsedHours = 0) {
  if (!result) return emptyMetric();
  const samples = result.samples;
  const minute = Math.max(0, Math.min(HOURS_PER_SCENARIO * 60, elapsedHours * 60));
  const step = Number(result.step_minutes) || 60;
  const i = Math.min(samples.length - 1, Math.floor(minute / step));
  const j = Math.min(samples.length - 1, i + 1);
  const part = i === j ? 0 : Math.max(0, Math.min(1, (minute - Number(samples[i].t)) / (Number(samples[j].t) - Number(samples[i].t))));
  const at = (body) => ({
    altitude: samples[i][body].el + (samples[j][body].el - samples[i][body].el) * part,
    azimuth: lerpAzimuth(samples[i][body].az, samples[j][body].az, part),
  });
  const terrain = result.status === 'terrain_visibility';
  const now = Date.parse(result.start_utc) + minute * 60000;
  return {
    sun: at('sun'), earth: at('earth'),
    sunVisible: terrain ? (minute === HOURS_PER_SCENARIO * 60 ? Boolean(samples[samples.length - 1].sun.visible) : inWindows(result.sun_windows, now)) : null,
    earthVisible: terrain ? (minute === HOURS_PER_SCENARIO * 60 ? Boolean(samples[samples.length - 1].earth.visible) : inWindows(result.earth_windows, now)) : null,
    sunHours: terrain ? hoursIn(result.sun_windows) : null,
    earthHours: terrain ? hoursIn(result.earth_windows) : null,
    bothHours: terrain ? overlapHours(result.sun_windows, result.earth_windows) : null,
    incidence: null, mode: terrain ? 'terrain' : 'geometry',
    summary: result.summary,
  };
}
