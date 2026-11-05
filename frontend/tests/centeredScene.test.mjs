import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {getCelestialScenario} from '../src/api.js';
import {backendVectorsAt,resolveLunarScene} from '../src/lunarEphemeris.js';
import {HOURS_PER_SCENARIO} from '../src/timeline.js';
import {MOON_FIXED_FRAME,MOON_NORTH,ORBIT_VIEW_DIRECTION,sceneCameraDistance} from '../src/lunarSceneMath.js';

const fixture=(date='2026-12-01')=>({
 origin:'MOON',frame:MOON_FIXED_FRAME,units:'km',start_utc:date+'T00:00:00Z',step_minutes:60,
 samples:Array.from({length:HOURS_PER_SCENARIO+1},(_,i)=>({t:i*60,sun_km:[1e8,i*1000,0],earth_km:[380000,i*100,1000]})),
});

test('global API request contains no site and is cached separately from visibility',async()=>{
 let calls=0;
 globalThis.fetch=async(url,options)=>{
  calls++;assert.ok(url.endsWith('/api/ephemeris'));
  const request=JSON.parse(options.body);
  assert.deepEqual(Object.keys(request).sort(),['end_utc','start_utc','step_minutes']);
  assert.equal(Date.parse(request.end_utc)-Date.parse(request.start_utc),709*3600000);
  return {ok:true,json:async()=>fixture()};
 };
 const first=await getCelestialScenario('2026-12-01','00:00');
 assert.equal(await getCelestialScenario('2026-12-01','00:00'),first);assert.equal(calls,1);
 const a=resolveLunarScene({lat:-89,lon:0},first,'2026-12-01','00:00',100.25);
 const b=resolveLunarScene({lat:89,lon:180},first,'2026-12-01','00:00',100.25);
 assert.equal(a.source,'backend');assert.deepEqual(a.geometry,b.geometry);
 assert.notDeepEqual(a.sky,b.sky);
 assert.deepEqual(backendVectorsAt(first,'2026-12-01','00:00',100.25),{sun_km:[1e8,100250,0],earth_km:[380000,10025,1000]});
});

test('incompatible frames and truncated global data are rejected and can retry',async()=>{
 let calls=0;
 globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({...fixture('2026-12-02'),frame:'J2000'})}};
 await assert.rejects(getCelestialScenario('2026-12-02','00:00'),/incompatible Moon-centered/);
 await assert.rejects(getCelestialScenario('2026-12-02','00:00'),/incompatible Moon-centered/);
 assert.equal(calls,2);
 globalThis.fetch=async()=>({ok:true,json:async()=>({...fixture('2026-12-03'),samples:fixture().samples.slice(0,73)})});
 await assert.rejects(getCelestialScenario('2026-12-03','00:00'),/incompatible Moon-centered/);
});

test('the centered default camera keeps lunar north up and Earth spread horizontally',()=>{
 const geometry=resolveLunarScene(null,null,'2026-11-24','12:00').geometry;
 const distance=sceneCameraDistance(geometry,ORBIT_VIEW_DIRECTION,1.6);
 const camera=new PerspectiveCamera(39,1.6,.1,200);
 camera.up.set(...MOON_NORTH);camera.position.copy(new Vector3(...ORBIT_VIEW_DIRECTION).normalize().multiplyScalar(distance));
 camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const north=new Vector3(...MOON_NORTH).project(camera),earth=new Vector3(...geometry.earthPosition).project(camera);
 assert.ok(north.y>0);assert.ok(Math.abs(earth.x)>3*Math.abs(earth.y));
 assert.deepEqual(geometry.origin,[0,0,0]);
});
