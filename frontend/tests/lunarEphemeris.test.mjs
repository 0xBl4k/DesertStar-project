import test from 'node:test';
import assert from 'node:assert/strict';
import {ephemerisSkyAt,resolveLunarScene} from '../src/lunarEphemeris.js';
import {sceneGeometry} from '../src/lunarSceneMath.js';

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

test('actual API directions take precedence and the legend uses that decision',()=>{
 const api={sun:{altitude:17,azimuth:55},earth:{altitude:5,azimuth:270}};
 const result=resolveLunarScene(site,api,utc.date,utc.time,2);
 assert.equal(result.source,'backend');
 assert.deepEqual(result.geometry,sceneGeometry(site,api));
 assert.equal(result.sky,api);
 assert.equal(resolveLunarScene(site,{...api,earth:{altitude:null,azimuth:0}},utc.date,utc.time).source,'ephemeris');
});

test('coverage endpoints are included; invalid/outside UTC values have no fake fallback',()=>{
 assert.ok(ephemerisSkyAt(site,'2026-11-01','00:00'));
 assert.ok(ephemerisSkyAt(site,'2027-11-01','00:00'));
 for(const [date,time,hours] of [['2026-10-31','23:59',0],['2027-11-01','00:01',0],['2027-10-31','23:30',1],['2026-11-31','12:00',0],['2026-11-24','24:00',0],['bad','12:00',0],['2026-11-24','12:00',NaN]]){
  assert.equal(ephemerisSkyAt(site,date,time,hours),null);
  assert.equal(resolveLunarScene(site,null,date,time,hours).source,'unavailable');
 }
});
