const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../static/camera-guard-core.js');

const box=(label,confidence,x=15,y=10,w=130,h=110)=>({
  class:label,score:confidence,bbox:[x,y,w,h]
});
test('cell phone blocks a confidently classified paper-like camera scene',()=>{
  const s=core.screen([box('cell phone',.89)],200,150);
  assert.equal(s.blocked,true);
  assert.equal(s.blocking_objects[0].label,'cell phone');
  assert.match(s.message,/telefon/);
  assert.equal(s.ood_certified,false);
});
test('person in center blocks when scene might include background and device',()=>{
  const s=core.screen([box('person',.97,20,10,140,140)],200,150);
  assert.equal(s.blocked,true);
});
test('electronic object outside explicitly selected crop does not block',()=>{
  const roi={x:0,y:0,w:.4,h:.4};
  const s=core.screen([box('cell phone',.95,170,115,20,20)],200,150,roi);
  assert.equal(s.blocked,false);
});
test('bottle has proposed crop but is not proof of material',()=>{
  const s=core.screen([box('bottle',.9)],200,150);
  assert.equal(s.blocked,false);
  assert.deepEqual(s.detected_waste_candidates,['bottle']);
  assert.equal(s.suggested_box.x,.075);
  assert.equal(s.ood_certified,false);
});
test('missing detections means no automatic object verification',()=>{
  const s=core.screen([],200,150);
  assert.equal(s.blocked,false);
  assert.deepEqual(s.detected_waste_candidates,[]);
  assert.equal(s.suggested_box,null);
});
test('low confidence detections are not accepted',()=>{
  const s=core.screen([box('cell phone',.43),box('bottle',.48)],200,150);
  assert.equal(s.blocked,false);
  assert.equal(s.suggested_box,null);
});
test('ROI must be valid and inside the picture',()=>{
  assert.throws(()=>core.parseRegion({x:.9,y:.9,w:.5,h:.5},100,100));
  assert.throws(()=>core.screen([],0,100));
  assert.throws(()=>core.screen(null,100,100));
});
