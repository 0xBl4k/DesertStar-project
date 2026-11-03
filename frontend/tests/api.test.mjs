import test from 'node:test';
import assert from 'node:assert/strict';
import {getScenario, metricAt, geometryEstimate, loadSiteCatalog} from '../src/api.js';
import {SITES} from '../src/data.js';

const response = body => ({ok: true, json: async () => body});
const fakeResult = (status='terrain_visibility') => ({
  status, start_utc:'2026-11-15T00:00:00+00:00', step_minutes:60,
  sun_windows: status === 'terrain_visibility' ? [{start:'2026-11-15T00:00:00+00:00',end:'2026-11-18T00:00:00+00:00'}] : null,
  earth_windows: status === 'terrain_visibility' ? [{start:'2026-11-15T12:30:00+00:00',end:'2026-11-18T00:00:00+00:00'}] : null,
  samples: Array.from({length:73}, (_, i) => ({t:i*60,
    sun:{el:1+i/100,az:260-i, ...(status==='terrain_visibility'?{visible:true}:{})},
    earth:{el:-4+i/10,az:135-i/10, ...(status==='terrain_visibility'?{visible:i>=13}:{})},
  })),
});

test('scientific presets are explicitly mapped and invalid sentinel site is not offered', () => {
 const sites=SITES.filter(s=>s.backendSiteId);
 assert.equal(sites.length,5);
 assert.ok(sites.some(s=>s.backendSiteId==='Site01_highest_point'));
 assert.ok(!sites.some(s=>s.backendSiteId==='Site01_lowest_point'));
});

test('preset request uses backend site_id and 72h UTC window', async () => {
 let payload;
 globalThis.fetch=async (url, opts)=>{
   assert.ok(url.endsWith('/api/visibility'));
   payload=JSON.parse(opts.body);
   return response(fakeResult());
 };
 const site=SITES.find(s=>s.backendSiteId==='Site01_highest_point');
 const data=await getScenario(site,'2026-11-15','00:00');
 assert.equal(payload.mode,'preset');
 assert.equal(payload.site_id,'Site01_highest_point');
 assert.equal(payload.start_utc,'2026-11-15T00:00:00.000Z');
 assert.equal(payload.end_utc,'2026-11-18T00:00:00.000Z');
 assert.equal(payload.step_minutes,60);
 const at12=metricAt(data,12);
 const at13=metricAt(data,13);
 assert.equal(at12.earthVisible,false);
 assert.equal(at13.earthVisible,true);
 assert.equal(at13.sunHours,72);
 assert.equal(at13.earthHours,59.5);
 assert.equal(at13.bothHours,59.5);
 assert.equal(metricAt(data,72).sunVisible,true);
});

test('Artemis regional site uses backend elevations for clearly marked geometry estimates', async () => {
 let payload;
 globalThis.fetch=async (_url,opts)=>{payload=JSON.parse(opts.body);return response(fakeResult('geometry_only'));};
 const site=SITES.find(s=>s.id==='haworth');
 const data=await getScenario(site,'2026-11-16','00:00');
 assert.equal(payload.mode,'custom');
 assert.equal(payload.site_id,undefined);
 assert.equal(payload.lat,site.lat);
 const metric=metricAt(data,18.5);
 assert.equal(metric.mode,'geometry');
 assert.equal(metric.sunVisible,true);
 assert.equal(metric.earthVisible,false);
 assert.equal(metric.sunHours,72);
 assert.equal(metric.earthHours,32);
 assert.equal(metric.bothHours,32);
 assert.equal(metric.referenceHorizonDeg,0);
 assert.equal(data.sun_windows,null);
 assert.equal(data.summary,undefined);
 assert.ok(Number.isFinite(metric.sun.altitude));
});

test('out-of-coverage 72h period fails before contacting backend', async () => {
 globalThis.fetch=()=>{throw new Error('Should not be called')};
 await assert.rejects(getScenario(SITES[0],'2027-10-31','00:00'),/72-hour analysis/);
});

test('invalid API errors are propagated and not cached forever', async () => {
 let called=0;
 const site={lat:-85.123,lon:123.45};
 globalThis.fetch=async ()=>{called++; return {ok:false,status:503,json:async()=>({detail:'Horizon dataset unavailable'})};};
 await assert.rejects(getScenario(site,'2027-01-10','00:00'),/Horizon dataset unavailable/);
 await assert.rejects(getScenario(site,'2027-01-10','00:00'),/Horizon dataset unavailable/);
 assert.equal(called,2);
});

test('site catalog is requested from the FastAPI endpoint', async () => {
 globalThis.fetch=async url=>{assert.ok(url.endsWith('/api/sites'));return response([{id:'center'}]);};
 const data=await loadSiteCatalog();
 assert.equal(data[0].id,'center');
});

test('geometry crossing times interpolate accurately from backend elevations', () => {
 const result = fakeResult('geometry_only');
 result.samples.forEach((sample,i) => {
   sample.sun.el = i - 36.5;
   sample.earth.el = 20.5 - i;
 });
 const est=geometryEstimate(result);
 assert.equal(est.terrain_included,false);
 assert.equal(est.sun_hours,35.5);
 assert.equal(est.earth_hours,20.5);
 assert.equal(est.both_hours,0);
 assert.equal(est.sun_windows[0].start,'2026-11-16T12:30:00.000Z');
 assert.equal(est.earth_windows[0].end,'2026-11-15T20:30:00.000Z');
 assert.equal(metricAt(result,36).sunVisible,false);
 assert.equal(metricAt(result,37).sunVisible,true);
 assert.equal(metricAt(result,20).earthVisible,true);
 assert.equal(metricAt(result,21).earthVisible,false);
});

test('geometry with Sun and Earth always below zero produces zero hours, not N/A', () => {
 const result=fakeResult('geometry_only');
 result.samples.forEach(sample=>{sample.sun.el=-1;sample.earth.el=-3;});
 const metric=metricAt(result,44);
 assert.equal(metric.mode,'geometry');
 assert.equal(metric.sunHours,0);
 assert.equal(metric.earthHours,0);
 assert.equal(metric.bothHours,0);
 assert.equal(metric.sunVisible,false);
 assert.equal(metric.earthVisible,false);
});

test('missing sample elevations never produce fictional horizon estimates', () => {
 const result=fakeResult('geometry_only');
 result.samples[31].earth.el=null;
 assert.equal(geometryEstimate(result),null);
 const metric=metricAt(result);
 assert.equal(metric.mode,'unavailable');
 assert.equal(metric.sunHours,null);
 assert.equal(metric.earthHours,null);
 assert.equal(metric.sunVisible,null);
});

test('preset terrain windows remain authoritative, even when elevation is positive', () => {
 const result=fakeResult('terrain_visibility');
 result.sun_windows=[];
 result.earth_windows=[];
 const metric=metricAt(result,12);
 assert.equal(metric.mode,'terrain');
 assert.equal(metric.sunVisible,false);
 assert.equal(metric.sunHours,0);
 assert.equal(metric.earthHours,0);
 assert.equal(geometryEstimate(result),null);
});
