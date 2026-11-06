// A mean phase cycle is 29.53059 days. Round UP to an hour so the backend's
// hourly samples include the entire cycle and an exact final playback sample.
export const MEAN_LUNAR_CYCLE_DAYS = 29.53059;
export const HOURS_PER_SCENARIO = Math.ceil(MEAN_LUNAR_CYCLE_DAYS * 24);
export const HOUR_MS = 3600000;
export const EPHEMERIS_BEGIN = Date.parse('2026-11-01T00:00:00Z');
export const EPHEMERIS_END = Date.parse('2027-11-01T00:00:00Z');
export const LATEST_SCENARIO_START = EPHEMERIS_END - HOURS_PER_SCENARIO * HOUR_MS;
export const FIRST_START_DATE = new Date(EPHEMERIS_BEGIN).toISOString().slice(0, 10);
export const LAST_START_DATE = new Date(LATEST_SCENARIO_START).toISOString().slice(0, 10);
export const PLAYBACK_HOURS_PER_SECOND = HOURS_PER_SCENARIO / 90;
export const TIMELINE_TICKS = [0, 7 * 24, 14 * 24, 21 * 24, HOURS_PER_SCENARIO];

export function scenarioTimestamp(date, time, elapsedHours = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '') ||
      !Number.isFinite(elapsedHours)) return null;
  const base = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(base) || new Date(base).toISOString().slice(0, 16) !== `${date}T${time}`) return null;
  return base + elapsedHours * HOUR_MS;
}

export function latestStartTime(date) {
  return date === LAST_START_DATE ? new Date(LATEST_SCENARIO_START).toISOString().slice(11, 16) : '23:59';
}

export function clampStartTime(date, time) {
  return time > latestStartTime(date) ? latestStartTime(date) : time;
}

export function advancePlayback(hours, deltaSeconds, speed = 1) {
  return Math.min(HOURS_PER_SCENARIO, hours + Math.max(0, Math.min(.1, deltaSeconds)) * PLAYBACK_HOURS_PER_SECOND * speed);
}
