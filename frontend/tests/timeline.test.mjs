import test from 'node:test';
import assert from 'node:assert/strict';
import {MEAN_LUNAR_CYCLE_DAYS,HOURS_PER_SCENARIO,EPHEMERIS_END,LATEST_SCENARIO_START,
  LAST_START_DATE,latestStartTime,clampStartTime,scenarioTimestamp,advancePlayback} from '../src/timeline.js';
import {ephemerisSkyAt,resolveLunarScene} from '../src/lunarEphemeris.js';
import {Vector3} from 'three';

test('timeline covers an entire mean phase cycle with an exact hourly endpoint',()=>{
  assert.equal(HOURS_PER_SCENARIO,709);
  assert.ok(HOURS_PER_SCENARIO>=MEAN_LUNAR_CYCLE_DAYS*24);
  assert.ok(HOURS_PER_SCENARIO-MEAN_LUNAR_CYCLE_DAYS*24<1);
  assert.equal(LAST_START_DATE,'2027-10-02');
  assert.equal(latestStartTime(LAST_START_DATE),'11:00');
  assert.equal(clampStartTime(LAST_START_DATE,'12:00'),'11:00');
  assert.equal(clampStartTime('2027-10-01','23:59'),'23:59');
  assert.equal(LATEST_SCENARIO_START+HOURS_PER_SCENARIO*3600000,EPHEMERIS_END);
});

test('every frame and final sample on the latest allowed cycle has local geometry',()=>{
  const site={lat:-87,lon:61};
  for(let hour=0;hour<=HOURS_PER_SCENARIO;hour+=.5){
    assert.ok(ephemerisSkyAt(site,LAST_START_DATE,'11:00',hour),`missing geometry at ${hour}h`);
  }
  assert.equal(ephemerisSkyAt(site,LAST_START_DATE,'11:00',HOURS_PER_SCENARIO+.01),null);
});

test('UTC parsing rejects rolled dates and scrubbed instants equal edited instants',()=>{
  assert.equal(scenarioTimestamp('2026-11-31','12:00'),null);
  assert.equal(scenarioTimestamp('2026-11-24','24:00'),null);
  assert.equal(scenarioTimestamp('2026-11-24','12:00',12.5),scenarioTimestamp('2026-11-25','00:30'));
});

test('playback reaches the monthly endpoint, supports speed and caps hidden-tab jumps',()=>{
  assert.ok(advancePlayback(0,.1,4)>advancePlayback(0,.1,1));
  assert.equal(advancePlayback(708.99,.1),HOURS_PER_SCENARIO);
  assert.equal(advancePlayback(1,30),advancePlayback(1,.1));
  assert.equal(advancePlayback(1,-1),1);
});

test('Earth librates while the Sun traverses the Moon-fixed sky over the full cycle',()=>{
  const directions=[];
  for(let day=0;day<=28;day+=7){
    directions.push(resolveLunarScene({lat:0,lon:0},null,'2026-11-15','00:00',day*24).geometry);
  }
  const angle=(a,b)=>new Vector3(...a).angleTo(new Vector3(...b))*180/Math.PI;
  const earth=angle(directions[0].earthDirection,directions[2].earthDirection);
  const sun=angle(directions[0].sunDirection,directions[2].sunDirection);
  assert.ok(earth>1&&earth<20,`Earth libration ${earth}°`);
  assert.ok(sun>150,`Sun half-cycle travel ${sun}°`);
});
