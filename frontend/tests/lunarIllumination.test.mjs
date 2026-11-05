import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,PerspectiveCamera} from 'three';
import {illuminationCosine,terminatorPoints} from '../src/lunarIlluminationMath.js';
import {resolveLunarScene} from '../src/lunarEphemeris.js';
import {sceneCenter,sceneCameraDistance,visibleSceneSpheres,MOON_NORTH} from '../src/lunarSceneMath.js';
import {viewPreset,effectiveScenePreferences} from '../src/scenePreferences.js';

const site={lat:-89.43890921454617,lon:-137.14356999445042};

test('day and night hemispheres face toward and away from the Sun',()=>{
 for(const direction of [[1,0,0],[0,1,0],[0,0,1],[-.1,.8,-.5]]){
  assert.ok(Math.abs(illuminationCosine(direction,direction)-1)<1e-12);
  assert.ok(Math.abs(illuminationCosine(direction.map(x=>-x),direction)+1)<1e-12);
 }
});

test('the complete terminator lies on a constant-radius plane perpendicular to the Sun',()=>{
 for(const sun of [[1,0,0],[0,1,0],[0,0,-1],[-.1,.8,-.5]]){
  const points=terminatorPoints(sun,1.972);
  assert.equal(points.length,257);
  assert.deepEqual(points[0],points.at(-1));
  for(const point of points){
   assert.ok(Math.abs(Math.hypot(...point)-1.972)<1e-12);
   assert.ok(Math.abs(illuminationCosine(point,sun))<1e-12);
  }
 }
});

test('date/time changes move the boundary while camera or style changes leave it geographic',()=>{
 const first=resolveLunarScene(site,null,'2026-11-15','12:00').geometry;
 const later=resolveLunarScene(site,null,'2026-11-24','12:00').geometry;
 const points=terminatorPoints(first.sunDirection,1.972);
 assert.notDeepEqual(points,terminatorPoints(later.sunDirection,1.972));
 for(const mode of ['scientific','cinematic']){
  const before=structuredClone(first);
  for(const view of [[0,0,1],[1,.2,-1]])sceneCameraDistance(first,view,1.5,39,1.18,sceneCenter(first),effectiveScenePreferences(viewPreset(mode)));
  assert.deepEqual(first,before);
  assert.deepEqual(points,terminatorPoints(first.sunDirection,1.972));
 }
});

test('Moon-only view fits the Moon; visible direction lines retain their endpoints',()=>{
 const geo=resolveLunarScene(site,null,'2026-11-24','12:00').geometry;
 const moonOnly={...viewPreset('scientific'),show3DObjects:false,showDirectionLines:false,showAxes:false,showSiteMarker:false};
 assert.equal(visibleSceneSpheres(geo,moonOnly).length,1);
 assert.deepEqual(sceneCenter(geo,moonOnly),[0,0,0]);
 assert.equal(visibleSceneSpheres(geo,{...moonOnly,showDirectionLines:true}).length,3);
 assert.ok(sceneCameraDistance(geo,[0,0,1],1,39,1.18,[0,0,0],moonOnly)<sceneCameraDistance(geo,[0,0,1],1));
});

test('framing includes cinematic glow shells and scientific guides at narrow aspect ratios',()=>{
 const geo=resolveLunarScene(site,null,'2026-11-24','12:00').geometry;
 for(const mode of ['scientific','cinematic'])for(const aspect of [.4,1,2])for(const view of [[0,0,1],[-1,.2,1]]){
  const settings=effectiveScenePreferences(viewPreset(mode)),target=sceneCenter(geo,settings);
  const d=sceneCameraDistance(geo,view,aspect,39,1.18,target,settings);
  const camera=new PerspectiveCamera(39,aspect,.1,200);
  camera.up.set(...(Math.abs(new Vector3(...view).normalize().dot(new Vector3(...MOON_NORTH)))>.999?[0,1,0]:MOON_NORTH));
  camera.position.copy(new Vector3(...target).addScaledVector(new Vector3(...view).normalize(),d));
  camera.lookAt(new Vector3(...target));camera.updateMatrixWorld();
  for(const {center,radius} of visibleSceneSpheres(geo,settings))for(let angle=0;angle<Math.PI*2;angle+=Math.PI/12){
   const point=new Vector3(center[0]+radius*Math.cos(angle),center[1]+radius*Math.sin(angle),center[2]).project(camera);
   assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1&&Math.abs(point.z)<1);
  }
 }
});

test('invalid light directions do not produce arbitrary shadow regions',()=>{
 for(const bad of [null,[],[0,0,0],[NaN,1,0],[1,2]]){
  assert.equal(illuminationCosine([1,0,0],bad),null);
  assert.deepEqual(terminatorPoints(bad,2),[]);
 }
 assert.deepEqual(terminatorPoints([1,0,0],-1),[]);
 assert.deepEqual(terminatorPoints([1,0,0],2,4),[]);
});
