import ephemeris from '../../data/ephemeris.json' with {type: 'json'};
import {sceneGeometry, skyFromMoonFixedVectors, MOON_FIXED_FRAME} from './lunarSceneMath.js';
import {scenarioTimestamp} from './timeline.js';

const start = Date.parse(ephemeris.start_utc + (/Z$|[+-]\d\d:\d\d$/.test(ephemeris.start_utc) ? '' : 'Z'));
export const SCENE_COVERAGE_START = start;
export const SCENE_COVERAGE_END = start + (ephemeris.sun_km.length - 1) * ephemeris.step_s * 1000;

/** Stored SPICE data drives the 3D view offline; analysis still uses FastAPI.
 * No synthetic orbit, terrain classification or visibility metric is invented.
 */
export function ephemerisVectorsAt(date,time,elapsedHours=0) {
  const timestamp=scenarioTimestamp(date,time,elapsedHours);
  if(ephemeris.frame!==MOON_FIXED_FRAME||timestamp===null||timestamp<SCENE_COVERAGE_START||timestamp>SCENE_COVERAGE_END)return null;
  const index=(timestamp-start)/(ephemeris.step_s*1000);
  const left=Math.floor(index),right=Math.min(left+1,ephemeris.sun_km.length-1),fraction=index-left;
  const interpolate=values=>values[left].map((v,i)=>v+(values[right][i]-v)*fraction);
  return {sun_km:interpolate(ephemeris.sun_km),earth_km:interpolate(ephemeris.earth_km)};
}

export function ephemerisSkyAt(site,date,time,elapsedHours=0) {
  const vectors=ephemerisVectorsAt(date,time,elapsedHours);
  return vectors?skyFromMoonFixedVectors(site,vectors.sun_km,vectors.earth_km):null;
}

export function backendVectorsAt(result,date,time,elapsedHours=0) {
  const timestamp=scenarioTimestamp(date,time,elapsedHours),base=Date.parse(result?.start_utc);
  if(timestamp===null||result?.origin!=='MOON'||result?.frame!==MOON_FIXED_FRAME||result?.units!=='km'||
      !Number.isFinite(base)||!Array.isArray(result.samples)||result.samples.length<2)return null;
  const minute=(timestamp-base)/60000,samples=result.samples;
  if(minute<samples[0].t||minute>samples.at(-1).t)return null;
  const index=Math.min(samples.length-2,Math.floor(minute/result.step_minutes));
  const a=samples[index],b=samples[index+1],part=(minute-a.t)/(b.t-a.t);
  if(!(part>=0&&part<=1))return null;
  const vector=key=>Array.isArray(a[key])&&a[key].length===3&&a[key].every(Number.isFinite)&&
    Array.isArray(b[key])&&b[key].length===3&&b[key].every(Number.isFinite)?a[key].map((v,i)=>v+(b[key][i]-v)*part):null;
  const sun_km=vector('sun_km'),earth_km=vector('earth_km');
  return sun_km&&earth_km?{sun_km,earth_km}:null;
}

/** Site-free API vectors have priority; site az/el is never a global fallback. */
export function resolveLunarScene(site,apiEphemeris,date,time,elapsedHours=0) {
  const backend=backendVectorsAt(apiEphemeris,date,time,elapsedHours);
  const local=backend?null:ephemerisVectorsAt(date,time,elapsedHours);
  const vectors=backend||local,geometry=sceneGeometry(vectors);
  const sky=vectors&&site?skyFromMoonFixedVectors(site,vectors.sun_km,vectors.earth_km):null;
  return {source:geometry?(backend?'backend':'ephemeris'):'unavailable',geometry,sky};
}
