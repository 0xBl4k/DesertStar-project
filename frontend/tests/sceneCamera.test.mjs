import test from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,MeshBasicMaterial,SphereGeometry,Vector3} from 'three';
import {cameraAction,cameraFocusTarget,cameraFitDistance,zoomDistance,followFocus,siteViewDirection,MIN_CAMERA_DISTANCE,MAX_CAMERA_DISTANCE} from '../src/sceneCameraMath.js';
import {siteMarkerAnchor,markerWorldScale} from '../src/lunarMarkers.js';
import {sceneGeometry,localFrame,MOON_SCENE_RADIUS,MOON_NORTH,ORBIT_VIEW_DIRECTION} from '../src/lunarSceneMath.js';
import {viewPreset,updateScenePreference,saveScenePreferences,loadScenePreferences} from '../src/scenePreferences.js';

const geometry=sceneGeometry({sun_km:[149e6,2e6,8e5],earth_km:[380000,20000,-7000]});
const state={lock:false,siteKey:'a',ready:true,width:800,height:500,command:4};
const command={serial:4,kind:'fit'};

test('playback, lighting changes and site selection in system mode never refit the zoom',()=>{
 assert.equal(cameraAction(state,{...state,geometry,settings:{showAxes:false},timestamp:123},command),null);
 assert.equal(cameraAction(state,{...state,siteKey:'b'},command),null);
 assert.equal(cameraAction({...state,lock:true},{...state,lock:true,siteKey:'b'},command),'site');
 assert.equal(cameraAction(state,{...state,lock:true},command),'site');
 assert.equal(cameraAction({...state,lock:true},state,command),'fit');
 assert.equal(cameraAction(state,state,{serial:5,kind:'zoom',factor:.8}),'zoom');
 assert.equal(cameraAction(state,state,{serial:5,kind:'fit'}),'fit');
 assert.equal(cameraAction(state,{...state,width:400},command),'fit');
});

test('Moon lock centers and frames the surface while system focus includes distant bodies',()=>{
 const options=viewPreset('scientific');
 assert.deepEqual(cameraFocusTarget(geometry,options,true),[0,0,0]);
 assert.notDeepEqual(cameraFocusTarget(geometry,options,false),[0,0,0]);
 const moon=cameraFitDistance(geometry,ORBIT_VIEW_DIRECTION,1.6,39,options,true,MOON_NORTH);
 const system=cameraFitDistance(geometry,ORBIT_VIEW_DIRECTION,1.6,39,options,false,MOON_NORTH);
 assert.ok(system>moon);assert.ok(moon>MOON_SCENE_RADIUS);
 assert.equal(geometry.sunDistanceKm,Math.hypot(149e6,2e6,8e5));
 assert.equal(geometry.earthDistanceKm,Math.hypot(380000,20000,-7000));
});

test('tracking a moving system pivot preserves user orbit and zoom',()=>{
 const camera=[13,7,-2],old=[1,2,3],next=[-3,1,4],moved=followFocus(camera,old,next);
 assert.deepEqual(moved.map((v,i)=>v-next[i]),camera.map((v,i)=>v-old[i]));
 assert.equal(zoomDistance(5,.8),4);assert.equal(zoomDistance(4,1.25),5);
 assert.equal(zoomDistance(3,.001),MIN_CAMERA_DISTANCE);
 assert.equal(zoomDistance(150,2),MAX_CAMERA_DISTANCE);
});

test('Show site faces its geographic coordinate, including both poles',()=>{
 for(const [lat,lon] of [[-90,0],[90,73],[0,0],[-89.4,-137],[14,180]]){
  const direction=siteViewDirection({lat,lon}),up=localFrame(lat,lon).up;
  assert.ok(Math.abs(Math.hypot(...direction)-1)<1e-12);
  assert.ok(new Vector3(...direction).dot(new Vector3(...up))>.97);
  assert.ok(Math.abs(new Vector3(...direction).dot(new Vector3(...MOON_NORTH)))<.999);
 }
});

test('selected marker anchors to actual relief and stays the same pixel size during zoom',()=>{
 const surface=new Mesh(new SphereGeometry(1.85,64,32),new MeshBasicMaterial());surface.updateMatrixWorld(true);
 const anchor=siteMarkerAnchor({lat:0,lon:0},surface);
 assert.ok(Math.abs(Math.hypot(...anchor)-1.853)<1e-5);
 assert.ok(anchor[1]>1.85);assert.ok(Math.abs(anchor[0])+Math.abs(anchor[2])<1e-8);
 assert.ok(Math.hypot(...siteMarkerAnchor({lat:0,lon:0},null))>MOON_SCENE_RADIUS);
 for(const depth of [.08,2,12,100])for(const fov of [25,39,60])for(const height of [360,600,1080]){
  const worldRadius=markerWorldScale(depth,fov,height);
  const projectedDiameter=2*worldRadius/(2*depth*Math.tan(fov*Math.PI/360))*height;
  assert.ok(Math.abs(projectedDiameter-18)<1e-10,'Selected dot must remain 18 CSS pixels across');
 }
 surface.geometry.dispose();surface.material.dispose();
});

test('camera scope persists and switching appearance never unlocks the Moon',()=>{
 const locked=updateScenePreference(viewPreset('scientific'),'lockOnMoon',true);
 let value;const storage={setItem:(_,v)=>value=v,getItem:()=>value};
 saveScenePreferences(locked,storage);assert.equal(loadScenePreferences(storage).lockOnMoon,true);
 assert.equal(viewPreset('cinematic',locked).lockOnMoon,true);
 assert.equal(viewPreset('scientific',locked).lockOnMoon,true);
});
