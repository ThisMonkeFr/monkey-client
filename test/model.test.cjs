const {test}=require('node:test');
const assert=require('node:assert/strict');
const model=require('../renderer/model.js');
const quad=(z,color)=>({pts:[[0,0,z],[8,0,z],[8,8,z],[0,8,z]],color});
test('opaque occlusion is independent of face submission order',()=>{
  for(const reverse of [false,true]){
    let q=[quad(5,[255,0,0,255]),quad(0,[0,0,255,255])];if(reverse)q.reverse();
    const data=model.rasterize(q,8,8).data;
    assert.deepEqual([...data.slice(0,4)],[255,0,0,255]);
  }
});
test('slanted surfaces intersect by pixel depth rather than nearest corner',()=>{
  const slope=quad(0,[255,0,0,255]);slope.pts[1][2]=10;slope.pts[2][2]=10;
  const data=model.rasterize([quad(5,[0,0,255,255]),slope],8,8).data;
  assert.deepEqual([...data.slice(4,8)],[0,0,255,255]);
  assert.deepEqual([...data.slice(24,28)],[255,0,0,255]);
});
test('outer-layer alpha blends once and occluded alpha is rejected',()=>{
  const data=model.rasterize([quad(0,[0,0,255,255]),quad(5,[255,0,0,128]),quad(-5,[0,255,0,128])],8,8).data;
  assert.deepEqual([...data.slice(0,4)],[128,0,127,255]);
  assert.deepEqual([...data.slice(36,40)],[128,0,127,255]);
});
test('slim detection reads unused UV columns, not the arm front',()=>{
  const tex=new Uint8ClampedArray(64*64*4);
  for(let y=20;y<32;y++)tex[(y*64+46)*4+3]=255;
  assert.equal(model.looksSlim(tex),true);
  for(let y=20;y<32;y++)tex[(y*64+54)*4+3]=255;
  assert.equal(model.looksSlim(tex),false);
});
test('cape attaches behind jacket and swings away from legs',()=>{
  const b=model.wornCape(0,.5)[0];assert.ok(b.c[2]+b.s[2]/2 < -2.25);assert.ok(b.angle>0);
  assert.deepEqual(b.pivot,[0,24,-3.1]);
});
test('rasterizer reuses buffers',()=>{
  const state=model.rasterize([],8,8),data=state.data;
  assert.equal(model.rasterize([],8,8,state).data,data);
});
