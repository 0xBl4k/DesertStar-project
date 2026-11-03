import test from 'node:test';
import assert from 'node:assert/strict';
import {localFrame,siteSurfacePosition,directionFromAzEl,sceneGeometry,previewSkyAt,MOON_SCENE_RADIUS} from '../src/lunarSceneMath.js';

const near=(actual,expected,eps=1e-9)=>{
 assert.equal(actual.length,expected.length);
 for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-expected[i])<eps,`component ${i}: ${actual[i]} !== ${expected[i]}`);
};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);

test('south pole points along positive Z of the right-handed scene',()=>{
 near(siteSurfacePosition(-90,0,1),[0,0,1]);
 near(siteSurfacePosition(0,0,1),[0,1,0]);
 near(siteSurfacePosition(0,90,1),[1,0,0]);
});

test('local E/N/Up vectors are orthonormal at a lunar polar site',()=>{
 const {east,north,up}=localFrame(-89.4,135.8);
 for(const v of [east,north,up]) assert.ok(Math.abs(dot(v,v)-1)<1e-9);
 assert.ok(Math.abs(dot(east,north))<1e-9);
 assert.ok(Math.abs(dot(east,up))<1e-9);
 assert.ok(Math.abs(dot(north,up))<1e-9);
});

test('azimuth 0/90 and elevation 90 match backend north/east/up convention',()=>{
 const {east,north,up}=localFrame(-87,61);
 near(directionFromAzEl(-87,61,0,0),north);
 near(directionFromAzEl(-87,61,90,0),east);
 near(directionFromAzEl(-87,61,0,90),up);
 near(directionFromAzEl(-87,61,180,0),north.map(x=>-x));
});

test('3D geometry uses supplied API az/el and selected site, not fake orbits',()=>{
 const site={lat:-86,lon:2};
 const sky={sun:{altitude:20,azimuth:210},earth:{altitude:6,azimuth:75}};
 const geo=sceneGeometry(site,sky);
 assert.ok(geo);
 near(geo.surface,siteSurfacePosition(site.lat,site.lon,MOON_SCENE_RADIUS));
 near(geo.sunDirection,directionFromAzEl(site.lat,site.lon,210,20));
 near(geo.earthDirection,directionFromAzEl(site.lat,site.lon,75,6));
 assert.ok(Math.abs(dot(geo.sunDirection,geo.frame.up)-Math.sin(20*Math.PI/180))<1e-9);
 assert.ok(Math.abs(dot(geo.earthDirection,geo.frame.up)-Math.sin(6*Math.PI/180))<1e-9);
 assert.ok(Math.abs(Math.hypot(...geo.sunPosition.map((x,i)=>x-geo.surface[i]))-2.8)<1e-9);
});

test('scene rejects missing/nonfinite coordinates while science is loading',()=>{
 assert.equal(sceneGeometry(null,{}),null);
 assert.equal(sceneGeometry({lat:-85,lon:0},{sun:{altitude:null,azimuth:0},earth:{altitude:0,azimuth:0}}),null);
 assert.equal(sceneGeometry({lat:95,lon:0},{sun:{altitude:0,azimuth:0},earth:{altitude:0,azimuth:0}}),null);
 assert.equal(sceneGeometry({lat:-85,lon:0},{sun:{altitude:0,azimuth:NaN},earth:{altitude:0,azimuth:0}}),null);
});

test('frontend-only preview changes with selected UTC time and remains finite',()=>{
 const first=previewSkyAt('2026-11-24','12:00',0);
 const later=previewSkyAt('2026-11-24','12:00',6);
 assert.notDeepEqual(first,later);
 assert.deepEqual(later,previewSkyAt('2026-11-24','18:00',0));
 const geo=sceneGeometry({lat:-89,lon:20},first);
 assert.ok(geo);
 for(const coords of [geo.sunPosition,geo.earthPosition])assert.ok(coords.every(Number.isFinite));
});
