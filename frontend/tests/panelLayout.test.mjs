import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePanelSize,constrainPanelSize,panelSizeLimits,resolvePanelSize} from '../src/panelLayout.js';

test('resizing leaves a usable lunar viewport and clamps the panel after a screen resize',()=>{
  const room={width:1200,height:760};
  assert.deepEqual(constrainPanelSize({width:5000,height:5000},room),{width:860,height:760});
  assert.deepEqual(constrainPanelSize({width:-200,height:-10},room),{width:280,height:180});
  const reduced=constrainPanelSize({width:860,height:760},{width:950,height:500});
  assert.equal(reduced.width,610);assert.equal(reduced.height,500);
});

test('stacked panels fit a narrow or short viewport instead of overflowing',()=>{
  for(const room of [{width:390,height:720},{width:240,height:160},{width:0,height:0}]) {
    const size=constrainPanelSize({width:1000,height:1000},room,true);
    assert.ok(size.width>=0&&size.width<=room.width);
    assert.ok(size.height>=0&&size.height<=room.height);
  }
});

test('corrupt saved dimensions restore the automatic layout',()=>{
  for(const value of [null,{},'bad',{width:'900',height:Infinity},{width:-20,height:0}])
    assert.deepEqual(normalizePanelSize(value),{width:null,height:null});
  assert.deepEqual(normalizePanelSize({width:460,height:510}),{width:460,height:510});
});

test('saved panel size returns after a temporary smaller desktop viewport',()=>{
  const preferred=Object.freeze({width:1100,height:900});
  const small={width:1248,height:528,gap:12,sceneMinWidth:360};
  const large={width:2480,height:1320,gap:20,sceneMinWidth:640};
  assert.deepEqual(resolvePanelSize(preferred,small),{width:876,height:528});
  assert.deepEqual(resolvePanelSize(preferred,large),{width:1100,height:900});
  assert.deepEqual(preferred,{width:1100,height:900});
  assert.deepEqual(resolvePanelSize({width:null,height:900},small),{width:null,height:528});
  assert.deepEqual(resolvePanelSize(null,large),{width:null,height:null});
});

test('desktop resize bounds reserve both the Moon and column gap from laptop to 4K',()=>{
  for(const [width,height,floor] of [[1024,768,360],[1280,600,360],[1366,768,360],[1920,1080,480],[2560,1440,640],[3440,1440,640],[3840,2160,640]]){
    const room={width:width-48,height:height-100,gap:20,sceneMinWidth:floor};
    const bounds=panelSizeLimits(room),size=constrainPanelSize({width:9999,height:9999},room);
    assert.ok(size.width+room.gap+floor<=room.width);
    assert.ok(size.height<=room.height);
    assert.equal(size.width,bounds.maxWidth);
    assert.equal(size.height,bounds.maxHeight);
  }
});
