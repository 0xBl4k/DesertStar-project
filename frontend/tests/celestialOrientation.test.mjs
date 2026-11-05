import test from 'node:test';
import assert from 'node:assert/strict';
import {Body,Observer,ObserverVector} from 'astronomy-engine';
import {Vector3} from 'three';
import {celestialOrientation,inertialBodyFrame} from '../src/celestialOrientation.js';

const start=Date.parse('2026-11-24T12:00:00Z');
const axis=(quaternion,value=[1,0,0])=>new Vector3(...value).applyQuaternion(quaternion);

test('Earth prime meridian agrees with an independent Greenwich observer vector',()=>{
  for(const hour of [0,6,12,24,360,709]){
    const date=new Date(start+hour*3600000),frame=inertialBodyFrame(Body.Earth,date);
    const observer=ObserverVector(date,new Observer(0,0,0),false);
    assert.ok(frame.prime.angleTo(new Vector3(observer.x,observer.y,observer.z))<1e-6);
    assert.ok(Math.abs(frame.prime.dot(frame.north))<1e-12);
    assert.ok(new Vector3().crossVectors(frame.prime,frame.east).distanceTo(frame.north)<1e-12);
  }
});

test('Earth turns through roughly a quarter rotation in six hours in the lunar frame',()=>{
  const first=celestialOrientation(Body.Earth,start),later=celestialOrientation(Body.Earth,start+6*3600000);
  const turn=axis(first).angleTo(axis(later))*180/Math.PI;
  assert.ok(turn>80&&turn<95,`six-hour Earth rotation ${turn}°`);
  // The lunar frame itself turns ~3.3° in six hours; its obliquity
  // produces a small apparent pole drift even though Earth's inertial pole is steady.
  assert.ok(axis(first,[0,1,0]).angleTo(axis(later,[0,1,0]))<4*Math.PI/180);
});

test('scrubbing forward, back and across a month produces deterministic valid orientations',()=>{
  for(const body of [Body.Earth,Body.Sun]){
    const first=celestialOrientation(body,start);
    const later=celestialOrientation(body,start+709*3600000);
    assert.ok(Math.abs(later.length()-1)<1e-12);
    assert.notDeepEqual(later.toArray(),first.toArray());
    assert.deepEqual(celestialOrientation(body,start).toArray(),first.toArray());
  }
});
