import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BufferAttribute,BufferGeometry} from 'three';
import {smoothLunarTerrain} from '../src/lunarTerrain.js';

test('smooth shading preserves every NASA triangle and the original cached asset',()=>{
  const bytes=readFileSync(new URL('../public/models/nasa-moon-color.glb',import.meta.url));
  const end=20+bytes.readUInt32LE(12),model=JSON.parse(bytes.subarray(20,end).toString()),start=end+8;
  const attribute=index=>{
    const accessor=model.accessors[index],view=model.bufferViews[accessor.bufferView];
    const size={SCALAR:1,VEC2:2,VEC3:3}[accessor.type],Type={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[accessor.componentType];
    return new BufferAttribute(new Type(bytes.buffer,bytes.byteOffset+start+(view.byteOffset||0)+(accessor.byteOffset||0),accessor.count*size),size);
  };
  const primitive=model.meshes[0].primitives[0],original=new BufferGeometry();
  original.setAttribute('position',attribute(primitive.attributes.POSITION));
  original.setAttribute('normal',attribute(primitive.attributes.NORMAL));
  original.setAttribute('uv',attribute(primitive.attributes.TEXCOORD_0));
  original.setIndex(attribute(primitive.indices));
  const before=original.attributes.normal.array.slice(),smooth=smoothLunarTerrain(original);
  assert.notEqual(smooth,original);
  assert.equal(smooth.attributes.position.count,original.index.count);
  let changed=0;
  for(let corner=0;corner<original.index.count;corner++) {
    const vertex=original.index.getX(corner);
    for(let axis=0;axis<3;axis++) {
      assert.equal(smooth.attributes.position.array[corner*3+axis],original.attributes.position.array[vertex*3+axis]);
      if(Math.abs(smooth.attributes.normal.array[corner*3+axis]-before[vertex*3+axis])>.001)changed++;
    }
    assert.ok(Math.abs(Math.hypot(...smooth.attributes.normal.array.subarray(corner*3,corner*3+3))-1)<1e-5);
  }
  assert.ok(changed>original.index.count/2,'Source face normals must become interpolated surface shading');
  assert.deepEqual(original.attributes.normal.array,before);
  original.dispose();smooth.dispose();
});
