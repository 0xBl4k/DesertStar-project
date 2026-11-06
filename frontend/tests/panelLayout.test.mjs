import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePanelSize,constrainPanelSize} from '../src/panelLayout.js';

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
