const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('software renderer resolves overlapping surfaces by per-pixel depth', () => {
  const {rasterize} = require('./static/media/model-geometry.js');
  assert.equal(typeof rasterize,'function');
  const points=[[0,0],[9,0],[0,9]];
  const pixels=rasterize([
    {points,depths:[2,2,2],color:[255,0,0]},
    {points,depths:[1,9,9],color:[0,255,0]}
  ],10,10);
  assert.deepEqual(Array.from(pixels.slice((1*10+1)*4,(1*10+1)*4+3)),[0,255,0]);
  assert.deepEqual(Array.from(pixels.slice((1*10+6)*4,(1*10+6)*4+3)),[255,0,0]);
});
test('software 3D projection draws centered geometry with finite screen coordinates', () => {
  const {parseOBJ, projectTriangles} = require('./static/media/model-geometry.js');
  assert.equal(typeof projectTriangles, 'function');
  const mesh = parseOBJ('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3');
  const faces = projectTriangles(mesh, -.85, .65, 3.4, 800, 420);
  assert.equal(faces.length, 1);
  assert.ok(faces[0].points.flat().every(Number.isFinite));
  assert.ok(faces[0].points.every(([x,y]) => x > 0 && x < 800 && y > 0 && y < 420));
  assert.ok(faces[0].depth > 0);
});
test('OBJ polygon faces become finite triangles with unit normals and material colors', () => {
  assert.ok(fs.existsSync('static/media/model-geometry.js'), 'OBJ geometry parser is missing');
  const {parseOBJ} = require('./static/media/model-geometry.js');
  const data = parseOBJ('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nusemtl steel\nf -4 -3 -2 -1');
  assert.equal(data.length, 6 * 9);
  assert.ok(data.every(Number.isFinite));
  for (let i = 0; i < data.length; i += 9) assert.equal(data[i + 5], 1);
});
test('uploaded assembly fits a centered browser scene without losing triangles', () => {
  assert.ok(fs.existsSync('static/media/model-geometry.js'), 'OBJ geometry parser is missing');
  const {parseOBJ} = require('./static/media/model-geometry.js');
  const source = fs.readFileSync('static/media/EcoSort_Assembly.obj', 'utf8');
  const triangles = source.split('\n').filter(l => l.startsWith('f ')).reduce((n,l)=> n+l.trim().split(/\s+/).length-3,0);
  const data = parseOBJ(source);
  assert.equal(data.length, triangles * 27);
  assert.ok(data.every(Number.isFinite));
  const xyz = data.filter((_,i) => i % 9 < 3);
  assert.ok(Math.max(...xyz) <= 1.001 && Math.min(...xyz) >= -1.001);
});
