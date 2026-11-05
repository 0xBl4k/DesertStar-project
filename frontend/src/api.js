/** LUNARIS -> DesertStar FastAPI bridge.
 * API results (not Astronomy Engine guesses) are authoritative for displayed analysis.
 * Presets use terrain-aware science; arbitrary coordinates are geometry-only.
 */
import {MOON_FIXED_FRAME} from './lunarSceneMath.js';
import {EPHEMERIS_BEGIN, EPHEMERIS_END, HOURS_PER_SCENARIO, HOUR_MS, scenarioTimestamp} from './timeline.js';
export {EPHEMERIS_BEGIN, EPHEMERIS_END, HOURS_PER_SCENARIO} from './timeline.js';
const base = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '');
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

function buildWindow(date, time) {
  const stamp = scenarioTimestamp(date, time);
  if (stamp === null) throw new Error('Enter a valid UTC date and time.');
  if (stamp < EPHEMERIS_BEGIN || stamp + HOURS_PER_SCENARIO * HOUR_MS > EPHEMERIS_END) {
    throw new Error('A full lunar cycle (709-hour analysis) must fit between 2026-11-01 and 2027-11-01 UTC.');
  }
  return {
    start_utc: new Date(stamp).toISOString(),
    end_utc: new Date(stamp + HOURS_PER_SCENARIO * HOUR_MS).toISOString(),
    step_minutes: 60,
  };
 }

function buildRequest(site,date,time) {
  if(!site)throw new Error('Choose a landing site.');
  const payload=buildWindow(date,time);
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
    const samples = json.samples;
    if (samples[0].t !== 0 || samples[samples.length - 1].t !== HOURS_PER_SCENARIO * 60 ||
        samples.some((sample, index) => !Number.isFinite(sample.t) ||
          (index > 0 && sample.t <= samples[index - 1].t) ||
          ![sample.sun?.el, sample.sun?.az, sample.earth?.el, sample.earth?.az].every(Number.isFinite))) {
      throw new Error('Backend samples do not cover the full lunar cycle.');
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

/** Global celestial requests contain no selected-site coordinates. */
export function getCelestialScenario(date,time) {
  const key=`moon-center|${date}|${time}`;
  if(cache.has(key))return cache.get(key);
  const pending=(async()=>{
    const payload=buildWindow(date,time);
    const response=await fetch(`${base}/api/ephemeris`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(detailOf(json,`Ephemeris HTTP ${response.status}`));
    if(json.origin!=='MOON'||json.frame!==MOON_FIXED_FRAME||json.units!=='km'||
       Date.parse(json.start_utc)!==Date.parse(payload.start_utc)||json.step_minutes!==60||
       !Array.isArray(json.samples)||json.samples.length!==HOURS_PER_SCENARIO+1||
       json.samples.some((sample,i)=>sample.t!==i*60||['sun_km','earth_km'].some(key=>
         !Array.isArray(sample[key])||sample[key].length!==3||!sample[key].every(Number.isFinite)||Math.hypot(...sample[key])===0))) {
      throw new Error('Backend returned incomplete or incompatible Moon-centered vectors.');
    }
    return json;
  })();
  cache.set(key,pending);
  pending.catch(()=>{if(cache.get(key)===pending)cache.delete(key)});
  if(cache.size>48)cache.delete(cache.keys().next().value);
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

/**
 * Estimate when a body's CENTER is above an ideal level 0° horizon.
 * These are derived only from DesertStar FastAPI ephemeris elevations.
 * No terrain, crater rim, solar-disc fraction, or RF link budget is included.
 * Crossing times are linearly interpolated between the returned hourly samples.
 * The backend's authoritative terrain windows are NEVER replaced.
 */
const geometryCache = new WeakMap();
export function geometryEstimate(result) {
  if (!result || result.status !== 'geometry_only') return null;
  if (result.geometry_estimate?.reference_horizon_deg === 0 &&
      Array.isArray(result.geometry_estimate.sun_windows) &&
      Array.isArray(result.geometry_estimate.earth_windows)) {
    return result.geometry_estimate; // Accept an equivalent estimate from a future backend.
  }
  if (geometryCache.has(result)) return geometryCache.get(result);
  const samples = result.samples;
  const start = Date.parse(result.start_utc);
  let estimate = null;
  if (Number.isFinite(start) && Array.isArray(samples) && samples.length >= 2 &&
      Number(samples[0].t) === 0 &&
      Math.abs(Number(samples[samples.length - 1].t) - HOURS_PER_SCENARIO * 60) < 1e-6 &&
      samples.every((s, i) => Number.isFinite(s.t) &&
        (i === 0 || s.t > samples[i - 1].t) &&
        Number.isFinite(s.sun?.el) && Number.isFinite(s.earth?.el))) {
    const windowsFor = body => {
      const out = [];
      let opened = samples[0][body].el > 0 ? 0 : null;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1], b = samples[i];
        const before = a[body].el, after = b[body].el;
        if ((before > 0) === (after > 0)) continue;
        const fraction = Math.max(0, Math.min(1, -before / (after - before)));
        const t = a.t + (b.t - a.t) * fraction;
        if (after > 0) {
          opened = t;
        } else if (opened !== null) {
          if (t > opened) out.push({start: new Date(start + opened * 60000).toISOString(), end: new Date(start + t * 60000).toISOString()});
          opened = null;
        }
      }
      if (opened !== null && samples[samples.length - 1].t > opened) {
        out.push({start: new Date(start + opened * 60000).toISOString(),
                  end: new Date(start + samples[samples.length - 1].t * 60000).toISOString()});
      }
      return out;
    };
    const sun_windows = windowsFor('sun');
    const earth_windows = windowsFor('earth');
    estimate = {
      reference_horizon_deg: 0,
      method: 'linear interpolation of backend elevation samples',
      terrain_included: false,
      sun_windows, earth_windows,
      sun_hours: hoursIn(sun_windows),
      earth_hours: hoursIn(earth_windows),
      both_hours: overlapHours(sun_windows, earth_windows),
    };
  }
  geometryCache.set(result, estimate);
  return estimate;
}

/** Adapt API fields (el/az) to original UI fields (altitude/azimuth).
 * Presets use backend terrain windows. Custom locations use explicitly labeled
 * geometric estimates derived from backend elevation samples (0° horizon).
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
  const geometric = result.status === 'geometry_only' ? geometryEstimate(result) : null;
  const sunWindows = terrain ? result.sun_windows : geometric?.sun_windows;
  const earthWindows = terrain ? result.earth_windows : geometric?.earth_windows;
  const now = Date.parse(result.start_utc) + minute * 60000;
  const atFinal = minute === HOURS_PER_SCENARIO * 60;
  return {
    sun: at('sun'), earth: at('earth'),
    sunVisible: !sunWindows ? null : atFinal
      ? (terrain ? Boolean(samples[samples.length - 1].sun.visible) : samples[samples.length - 1].sun.el > 0)
      : inWindows(sunWindows, now),
    earthVisible: !earthWindows ? null : atFinal
      ? (terrain ? Boolean(samples[samples.length - 1].earth.visible) : samples[samples.length - 1].earth.el > 0)
      : inWindows(earthWindows, now),
    sunHours: terrain ? hoursIn(sunWindows) : (geometric?.sun_hours ?? null),
    earthHours: terrain ? hoursIn(earthWindows) : (geometric?.earth_hours ?? null),
    bothHours: terrain ? overlapHours(sunWindows, earthWindows) : (geometric?.both_hours ?? null),
    incidence: null, mode: terrain ? 'terrain' : geometric ? 'geometry' : 'unavailable',
    referenceHorizonDeg: geometric ? 0 : null,
    summary: terrain ? result.summary : null,
  };
}
