import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SphereGeometry,Vector3,PerspectiveCamera} from 'three';
import {
 localFrame,siteSurfacePosition,surfaceCoordinates,markerPosition,directionFromAzEl,
 sceneGeometry,sceneCenter,sceneCameraDistance,moonFixedToScene,nasaModelToScene,
 mapSphereToScene,MOON_SCENE_RADIUS,SUN_RADIUS,EARTH_RADIUS,
} from '../src/lunarSceneMath.js';

const near=(actual,expected,eps=1e-9)=>{
 assert.equal(actual.length,expected.length);
 actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<eps,JSON.stringify({actual,expected})));
};
const normalize=v=>{const d=Math.hypot(...v);return v.map(x=>x/d)};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const sky={sun:{altitude:20,azimuth:210},earth:{altitude:6,azimuth:75}};
const sites=[[-90,0],[-89.4389,-137.1436],[-87,61],[0,0],[28,147],[90,35]];

test('geographic reference directions share the scene frame',()=>{
 near(siteSurfacePosition(-90,0,1),[0,0,1]);
 near(siteSurfacePosition(90,0,1),[0,0,-1]);
 near(siteSurfacePosition(0,0,1),[0,1,0]);
 near(siteSurfacePosition(0,90,1),[1,0,0]);
});

test('local east/north/up is an orthonormal right-handed basis, including poles',()=>{
 for(const [lat,lon] of sites){
  const {east,north,up}=localFrame(lat,lon);
  for(const v of [east,north,up])assert.ok(Math.abs(dot(v,v)-1)<1e-9);
  for(const [a,b] of [[east,north],[east,up],[north,up]])assert.ok(Math.abs(dot(a,b))<1e-9);
  near(new Vector3(...east).cross(new Vector3(...north)).toArray(),up);
  near(directionFromAzEl(lat,lon,0,0),north);
  near(directionFromAzEl(lat,lon,90,0),east);
  near(directionFromAzEl(lat,lon,27,90),up);
 }
});

test('surface picking round trips all hemispheres and the longitude seam',()=>{
 for(const lat of [-89.9,-65,0,22,89.9])for(const lon of [-180,-137,0,61,179.99]){
  const point=siteSurfacePosition(lat,lon);
  const picked=surfaceCoordinates(point);
  near([picked.lat,picked.lon],[lat,lon],1e-8);
  near(markerPosition({...picked,worldPoint:[1,0,0]}),point.map(x=>x*(MOON_SCENE_RADIUS+.03)/MOON_SCENE_RADIUS));
 }
 for(const invalid of [null,[],[0,0,0],[NaN,1,1],[1,2]])assert.equal(surfaceCoordinates(invalid),null);
});

test('NASA native prime meridian, east and north match the registered lunar frame',()=>{
 near(nasaModelToScene([0,0,-1]),siteSurfacePosition(0,0,1));
 near(nasaModelToScene([-1,0,0]),siteSurfacePosition(0,90,1));
 near(nasaModelToScene([0,1,0]),siteSurfacePosition(90,0,1));
});

test('reference Moon texture UVs agree with coordinates on actual Three sphere vertices',()=>{
 const sphere=new SphereGeometry(1,32,16);
 const p=sphere.attributes.position,uv=sphere.attributes.uv;
 for(let i=0;i<p.count;i++){
  const lat=uv.getY(i)*180-90;
  if(Math.abs(lat)>89.99)continue; // SphereGeometry deliberately offsets seam UVs at the poles.
  const lon=(uv.getX(i)-.5)*360;
  near(mapSphereToScene([p.getX(i),p.getY(i),p.getZ(i)]),siteSurfacePosition(lat,lon,1),1e-6);
 }
 sphere.dispose();
});

test('rays and directional sunlight originate at the displayed selected marker',()=>{
 for(const [lat,lon] of sites){
  const site={lat,lon};const geo=sceneGeometry(site,sky);
  near(geo.marker,markerPosition(site));
  near(normalize(geo.sunPosition.map((v,i)=>v-geo.marker[i])),geo.sunDirection);
  near(normalize(geo.earthPosition.map((v,i)=>v-geo.marker[i])),geo.earthDirection);
  assert.ok(Math.hypot(...geo.sunPosition)-SUN_RADIUS>MOON_SCENE_RADIUS);
  assert.ok(Math.hypot(...geo.earthPosition)-EARTH_RADIUS>MOON_SCENE_RADIUS);
  assert.ok(Math.abs(dot(geo.sunDirection,geo.frame.up)-Math.sin(20*Math.PI/180))<1e-9);
 }
});

test('API direction conversion agrees with independent topocentric ephemeris vectors',async()=>{
 const data=JSON.parse(await readFile(new URL('../../data/ephemeris.json',import.meta.url),'utf8'));
 for(const [lat,lon] of sites)for(const index of [0,324,2178,4380,8760]){
  const a=lat*Math.PI/180,b=lon*Math.PI/180;
  const up=[Math.cos(a)*Math.cos(b),Math.cos(a)*Math.sin(b),Math.sin(a)];
  const east=[-Math.sin(b),Math.cos(b),0];
  const north=[-Math.sin(a)*Math.cos(b),-Math.sin(a)*Math.sin(b),Math.cos(a)];
  for(const body of ['sun_km','earth_km']){
   const v=data[body][index].map((x,i)=>x-1737.4*up[i]);
   const n=normalize(v);
   const el=Math.asin(dot(n,up))*180/Math.PI;
   const az=(Math.atan2(dot(v,east),dot(v,north))*180/Math.PI+360)%360;
   near(directionFromAzEl(lat,lon,az,el),moonFixedToScene(n),1e-9);
  }
 }
});

test('camera fits every body for landscape, portrait and several orbit angles',()=>{
 for(const [lat,lon] of sites)for(const aspect of [.45,1,1.8,3])for(const view of [[0,0,1],[1,0,0],[0,.95,.1],[-1,.2,-1]]){
  const geo=sceneGeometry({lat,lon},sky),center=sceneCenter(geo);
  const distance=sceneCameraDistance(geo,view,aspect);
  assert.ok(Number.isFinite(distance)&&distance>0);
  const direction=new Vector3(...view).normalize();
  const camera=new Vector3(...center).addScaledVector(direction,distance);
  const perspective=new PerspectiveCamera(39,aspect,.1,200);
  perspective.position.copy(camera);perspective.lookAt(new Vector3(...center));perspective.updateMatrixWorld();
  const bodies=[[[0,0,0],geo.radius],[geo.sunPosition,SUN_RADIUS],[geo.earthPosition,EARTH_RADIUS],
   ...Object.values(geo.frame).map(axis=>[geo.marker.map((v,i)=>v+axis[i]*.86),.12])];
  for(const [point,radius] of bodies){
   // Project independent surface samples through Three's actual camera matrix.
   for(let latitude=-90;latitude<=90;latitude+=30)for(let longitude=0;longitude<360;longitude+=30){
    const a=latitude*Math.PI/180,b=longitude*Math.PI/180;
    const projected=new Vector3(point[0]+radius*Math.cos(a)*Math.cos(b),point[1]+radius*Math.sin(a),point[2]+radius*Math.cos(a)*Math.sin(b)).project(perspective);
    assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&Math.abs(projected.z)<1,JSON.stringify({aspect,view,point,projected}));
   }
  }
 }
});

test('incomplete or invalid directions never produce a fabricated scene',()=>{
 for(const site of [null,{lat:95,lon:0},{lat:0,lon:NaN}])assert.equal(sceneGeometry(site,sky),null);
 for(const invalid of [null,{...sky,sun:{altitude:null,azimuth:0}},{...sky,earth:{altitude:95,azimuth:0}}])assert.equal(sceneGeometry({lat:-85,lon:0},invalid),null);
 assert.equal(sceneGeometry({lat:-85,lon:0},sky,{sunDistance:1}),null);
});
