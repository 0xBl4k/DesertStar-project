import test from 'node:test';
import assert from 'node:assert/strict';
import {ephemerisSkyAt,resolveLunarScene} from '../src/lunarEphemeris.js';
import {sceneGeometry,MOON_FIXED_FRAME} from '../src/lunarSceneMath.js';

const site={lat:-89.43890921454617,lon:-137.14356999445042};
const utc={date:'2026-11-15',time:'00:00'};

test('stored geometry reproduces the established backend reference sample',()=>{
 const sky=ephemerisSkyAt(site,utc.date,utc.time);
 // POST /api/visibility uses the same stored SPICE samples and spherical site.
 assert.ok(Math.abs(sky.sun.altitude-1.378947938615455)<1e-10);
 assert.ok(Math.abs(sky.sun.azimuth-251.5612322293523)<1e-10);
 assert.ok(Math.abs(sky.earth.altitude-(-3.9461353965253734))<1e-10);
 assert.ok(Math.abs(sky.earth.azimuth-134.49901465183595)<1e-10);
 assert.equal(resolveLunarScene(site,null,utc.date,utc.time).source,'ephemeris');
});

test('fractional playback and UTC edits describe the same instant',()=>{
 const played=ephemerisSkyAt(site,'2026-11-24','12:00',6.5);
 assert.deepEqual(played,ephemerisSkyAt(site,'2026-11-24','18:30',0));
 assert.notDeepEqual(played,ephemerisSkyAt(site,'2026-11-24','12:00',0));
 assert.notDeepEqual(played,ephemerisSkyAt(site,'2026-12-24','18:30',0));
});

test('Moon-centered API vectors take precedence while site angles cannot drive the scene',()=>{
 const vectors={sun_km:[1e8,2e7,-1e6],earth_km:[380000,20000,5000]};
 const api={origin:'MOON',frame:MOON_FIXED_FRAME,units:'km',start_utc:'2026-11-15T00:00:00Z',step_minutes:60,
  samples:Array.from({length:4},(_,i)=>({t:i*60,...vectors}))};
 const result=resolveLunarScene(site,api,utc.date,utc.time,2);
 assert.equal(result.source,'backend');
 assert.deepEqual(result.geometry,sceneGeometry(vectors));
 assert.equal(resolveLunarScene(site,{...api,frame:'J2000'},utc.date,utc.time).source,'ephemeris');
 assert.equal(resolveLunarScene(site,{sun:{altitude:17,azimuth:55},earth:{altitude:5,azimuth:270}},utc.date,utc.time).source,'ephemeris');
});

test('opposite sites and no site have exactly the same scene and shadow boundary',()=>{
 const first=resolveLunarScene(site,null,utc.date,utc.time),opposite=resolveLunarScene({lat:89.4,lon:42.9},null,utc.date,utc.time);
 const none=resolveLunarScene(null,null,utc.date,utc.time);
 assert.deepEqual(first.geometry,opposite.geometry);assert.deepEqual(first.geometry,none.geometry);
 assert.notDeepEqual(first.sky,opposite.sky);assert.equal(none.sky,null);
});

test('coverage endpoints are included; invalid/outside UTC values have no fake fallback',()=>{
 assert.ok(ephemerisSkyAt(site,'2026-11-01','00:00'));
 assert.ok(ephemerisSkyAt(site,'2027-11-01','00:00'));
 for(const [date,time,hours] of [['2026-10-31','23:59',0],['2027-11-01','00:01',0],['2027-10-31','23:30',1],['2026-11-31','12:00',0],['2026-11-24','24:00',0],['bad','12:00',0],['2026-11-24','12:00',NaN]]){
  assert.equal(ephemerisSkyAt(site,date,time,hours),null);
  assert.equal(resolveLunarScene(site,null,date,time,hours).source,'unavailable');
 }
});
