const {test}=require('node:test');const assert=require('node:assert/strict');
const core=()=>require('../static/suite-core.js');
test('routing refuses uncertain results and unknown metal',()=>{
 const c=core();let r={label:'plastic',confidence:91,top_results:[{label:'plastic',confidence:91},{label:'paper',confidence:5}]};
 assert.equal(c.decide(r).action,'grip');assert.equal(c.decide({...r,confidence:60}).action,'review');
 assert.equal(c.decide({...r,label:'metal',top_results:[{label:'metal',confidence:91},{label:'paper',confidence:5}]}).action,'review');
 assert.equal(c.decide({...r,label:'metal',top_results:[{label:'metal',confidence:91},{label:'paper',confidence:5}]},'nonferrous').action,'grip');
 assert.equal(c.decide({...r,confidence:NaN}).action,'review');
});
test('correction preserves original evidence and records human decision',()=>{
 const c=core(),r={id:'abc',label:'glass',confidence:61,top_results:[{label:'glass',confidence:61},{label:'paper',confidence:35}]};
 const corrected=c.correct(r,'paper','2026-10-09T10:00:00Z');
 assert.equal(corrected.originalLabel,'glass');assert.equal(corrected.label,'paper');assert.equal(corrected.confidence,61);
 assert.deepEqual(corrected.top_results,r.top_results);assert.equal(corrected.corrected,true);assert.equal(r.label,'glass');
 const again=c.correct(corrected,'plastic','2026-10-09T11:00:00Z');assert.equal(again.originalLabel,'glass');
 assert.equal(c.decide(corrected).action,'grip');assert.throws(()=>c.correct(r,'alien','now'));
});
test('grip physics accounts for two opposing fingers and capacity',()=>{
 const c=core(),p=c.physics({mass:1,friction:.5,safety:2,lever:.2,maxForce:30,speed:.2,distance:1});
 assert.equal(p.requiredForce,19.62);assert.ok(Math.abs(p.torque-3.924)<1e-9);assert.equal(p.arrivalSeconds,5);assert.equal(p.canGrip,true);
 assert.equal(c.physics({mass:1,friction:.5,safety:2,lever:.2,maxForce:10,speed:.2,distance:1}).canGrip,false);
 for (const key of ['mass','friction','safety','lever','speed']) assert.throws(()=>c.physics({mass:1,friction:.5,safety:2,lever:.2,maxForce:30,speed:.2,distance:1,[key]:NaN}));
 assert.throws(()=>c.physics({mass:1,friction:0,safety:2,lever:.2,maxForce:30,speed:.2,distance:1}));
});
test('impact converts short tons to kilograms, accepts fraction and subtracts extra operations',()=>{
 const c=core();assert.ok(Math.abs(c.impact({mass:907.18474,accepted:100,factor:1.04,extra:0,unit:"mt_per_short_ton"}).saving-1040)<1e-8);
 assert.equal(c.impact({mass:10,accepted:50,factor:2,extra:3}).saving,7);
 assert.equal(c.impact({mass:0,accepted:100,factor:2,extra:0}).saving,0);
 assert.throws(()=>c.impact({mass:1,accepted:101,factor:1,extra:0}));assert.throws(()=>c.impact({mass:1,accepted:90,factor:NaN,extra:0}));
});
test('crop rectangle normalizes reverse drawing and rejects tiny area',()=>{
 const c=core();assert.deepEqual(c.rectangle({x:.8,y:.8},{x:.2,y:.2}),{x:.2,y:.2,w:.6,h:.6});
 assert.equal(c.rectangle({x:.1,y:.1},{x:.101,y:.101}),null);
});
test('CSV escapes commas, quotes and spreadsheet formulas',()=>{
 const c=core();assert.equal(c.csvCell('a,"b"'),'"a,""b"""');assert.equal(c.csvCell('=cmd'),"\"'=cmd\"");
});
