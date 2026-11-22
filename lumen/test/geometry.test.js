import test from 'node:test';
import assert from 'node:assert/strict';
import { v3, norm } from '../src/vec3.js';
import { sphere, quad, triangle, buildBVH } from '../src/geometry.js';

const hit = () => ({ t: 0, p: v3(), g: v3(), n: v3(), uv: [0, 0], mat: null, light: null });

test('sphere hit: front, miss, inside', () => {
  const s = sphere(v3(0, 0, 0), 1, {});
  const rec = hit();
  assert.ok(s.hit(v3(0, 0, 5), v3(0, 0, -1), 0, Infinity, rec));
  assert.equal(rec.t, 4);
  assert.ok(Math.abs(rec.g.z - 1) < 1e-9);
  assert.ok(!s.hit(v3(0, 2, 5), v3(0, 0, -1), 0, Infinity, rec));
  // from inside: exits at t = 1
  assert.ok(s.hit(v3(0, 0, 0), v3(0, 0, 1), 0, Infinity, rec));
  assert.ok(Math.abs(rec.t - 1) < 1e-9);
});

test('quad hit: inside and outside', () => {
  const q = quad(v3(-1, 0, -1), v3(2, 0, 0), v3(0, 0, 2), {});
  const rec = hit();
  assert.ok(q.hit(v3(0, 1, 0), v3(0, -1, 0), 0, Infinity, rec));
  assert.ok(Math.abs(rec.t - 1) < 1e-9);
  assert.ok(Math.abs(rec.p.x) < 1e-9 && Math.abs(rec.p.z) < 1e-9);
  assert.ok(!q.hit(v3(2, 1, 0), v3(0, -1, 0), 0, Infinity, rec));
});

test('triangle hit: barycentric bounds', () => {
  const tri = triangle(v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0), {});
  const rec = hit();
  assert.ok(tri.hit(v3(0.2, 0.2, 1), v3(0, 0, -1), 0, Infinity, rec));
  assert.ok(Math.abs(rec.t - 1) < 1e-9);
  assert.ok(!tri.hit(v3(0.9, 0.9, 1), v3(0, 0, -1), 0, Infinity, rec));
});

test('BVH matches brute force on random rays', () => {
  // Deterministic pseudo-random scene.
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const prims = [];
  const material = {};
  for (let i = 0; i < 40; i++) {
    const c = v3((rand() - 0.5) * 10, (rand() - 0.5) * 10, (rand() - 0.5) * 10);
    prims.push(sphere(c, 0.2 + rand() * 1.2, material));
  }
  prims.push(quad(v3(-20, -3, -20), v3(40, 0, 0), v3(0, 0, 40), material));

  const bvh = buildBVH(prims);

  let compared = 0;
  let hits = 0;
  for (let i = 0; i < 800; i++) {
    const o = v3((rand() - 0.5) * 16, (rand() - 0.5) * 16, 8 + rand() * 4);
    const d = norm(v3((rand() - 0.5) * 2, (rand() - 0.5) * 2, -1));
    const rec = hit();
    const found = bvh.intersect(o, d, 0, Infinity, rec);
    const tBvh = found ? rec.t : Infinity;

    // Brute force
    let best = Infinity;
    for (const p of prims) {
      const r = hit();
      if (p.hit(o, d, 1e-9, best, r) && r.t < best) best = r.t;
    }
    if (Number.isFinite(best)) hits++;
    assert.ok(
      Math.abs(best - tBvh) < 1e-7 || (best === Infinity && tBvh === Infinity),
      `ray ${i}: bvh=${tBvh} brute=${best}`
    );
    compared++;
  }
  assert.equal(compared, 800);
  assert.ok(hits > 100, 'expected a decent number of hits');
});
