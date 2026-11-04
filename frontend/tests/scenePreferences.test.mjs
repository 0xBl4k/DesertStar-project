import test from 'node:test';
import assert from 'node:assert/strict';
import {viewPreset,effectiveScenePreferences,normalizeScenePreferences,updateScenePreference,loadScenePreferences,saveScenePreferences,SCENE_PREFERENCES_KEY} from '../src/scenePreferences.js';
import {resolveLunarScene} from '../src/lunarEphemeris.js';

test('scientific preset emphasizes the boundary and guides without decorative rendering',()=>{
 const value=effectiveScenePreferences(viewPreset('scientific'));
 assert.equal(value.showTerminator,true);assert.equal(value.showDarkOverlay,true);
 assert.equal(value.showAxes,true);assert.equal(value.showDirectionLines,true);
 assert.equal(value.showSunGlow,false);assert.equal(value.showEarthGlow,false);assert.equal(value.showBloom,false);
});

test('cinematic preset enables glow while preserving the same celestial geometry',()=>{
 const site={lat:-87,lon:61},scene=resolveLunarScene(site,null,'2026-11-15','00:00');
 const original=structuredClone(scene);
 const options=effectiveScenePreferences(viewPreset('cinematic'));
 assert.equal(options.showSunGlow,true);assert.equal(options.showEarthGlow,true);assert.equal(options.showBloom,true);
 assert.equal(options.showAxes,false);assert.equal(options.showDirectionLines,false);
 assert.deepEqual(scene,original);
});

test('master effects switch gates glow/bloom independently of scientific overlays',()=>{
 const options=effectiveScenePreferences({...viewPreset('cinematic'),showEffects:false,showTerminator:true,showDarkOverlay:true});
 assert.equal(options.showSunGlow,false);assert.equal(options.showEarthGlow,false);assert.equal(options.showBloom,false);
 assert.equal(options.showTerminator,true);assert.equal(options.showDarkOverlay,true);
});

test('hidden bodies and disabled night mask do not retain unnecessary glow or hatching',()=>{
 const options=effectiveScenePreferences({...viewPreset('cinematic'),show3DObjects:false,showHatching:true,showDarkOverlay:false});
 assert.equal(options.showSunGlow,false);assert.equal(options.showEarthGlow,false);assert.equal(options.showBloom,false);
 assert.equal(options.showHatching,false);
});

test('individual choices become custom and reset presets remain immutable',()=>{
 const preset=viewPreset('scientific'),updated=updateScenePreference(preset,'showAxes',false);
 assert.equal(updated.mode,'custom');assert.equal(updated.showAxes,false);assert.equal(preset.showAxes,true);
 assert.deepEqual(viewPreset('scientific'),preset);
 assert.deepEqual(updateScenePreference(preset,'unknown',false),preset);
});

test('preferences survive storage and corrupt/blocked storage falls back safely',()=>{
 let saved;const storage={setItem:(key,value)=>{assert.equal(key,SCENE_PREFERENCES_KEY);saved=value},getItem:()=>saved};
 const custom=updateScenePreference(viewPreset('cinematic'),'showTerminator',true);
 saveScenePreferences(custom,storage);assert.deepEqual(loadScenePreferences(storage),custom);
 saved='broken JSON';assert.deepEqual(loadScenePreferences(storage),viewPreset('scientific'));
 const blocked={getItem:()=>{throw new Error('blocked')},setItem:()=>{throw new Error('blocked')}};
 assert.doesNotThrow(()=>saveScenePreferences(custom,blocked));
 assert.deepEqual(loadScenePreferences(blocked),viewPreset('scientific'));
});

test('saved input accepts only known boolean preferences',()=>{
 const value=normalizeScenePreferences({mode:'cinematic',showAxes:'false',showEffects:0,unknown:true});
 assert.equal(value.showAxes,false);assert.equal(value.showEffects,true);assert.equal(value.unknown,undefined);
 for(const invalid of [null,[],true,'cinematic'])assert.deepEqual(normalizeScenePreferences(invalid),viewPreset('scientific'));
});
