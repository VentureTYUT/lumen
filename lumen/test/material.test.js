import test from 'node:test';
import assert from 'node:assert/strict';
import { v3, dot, norm } from '../src/vec3.js';
import { diffuse, metal, coated, glass, emissive } from '../src/material.js';
import { rng } from '../src/rng.js';

const hit = (p = v3()) => ({ p, uv: [0.5, 0.5] });

test('diffuse pdf integrates to one over the hemisphere', () => {
  const m = diffuse(v3(0.5, 0.5, 0.5));
  const n = v3(0, 0, 1);
  const r = rng(7);
  const N = 200000;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    // uniform hemisphere sampling, density 1/(2π)
    const z = r.next();
    const rr = Math.sqrt(1 - z * z);
    const phi = 2 * Math.PI * r.next();
    const wi = { x: rr * Math.cos(phi), y: rr * Math.sin(phi), z };
    sum += m.pdf(v3(0, 0, 1), wi, n);
  }
  const est = (2 * Math.PI / N) * sum;
  assert.ok(Math.abs(est - 1) < 0.02, `integral = ${est}`);
});

test('diffuse hemispherical reflectance equals albedo', () => {
  const albedo = v3(0.7, 0.4, 0.2);
  const m = diffuse(albedo);
  const n = v3(0, 0, 1);
  const wo = v3(0, 0, 1);
  const r = rng(3);
  const N = 100000;
  let rx = 0;
  let rg = 0;
  let rb = 0;
  for (let i = 0; i < N; i++) {
    const z = r.next();
    const rr = Math.sqrt(1 - z * z);
    const phi = 2 * Math.PI * r.next();
    const wi = { x: rr * Math.cos(phi), y: rr * Math.sin(phi), z };
    const f = m.eval(wo, wi, n, hit());
    const cos = z;
    // ∫ f cos dω ≈ (2π/N) Σ f cos
    rx += f.x * cos;
    rg += f.y * cos;
    rb += f.z * cos;
  }
  const k = (2 * Math.PI) / N;
  assert.ok(Math.abs(rx * k - albedo.x) < 0.02);
  assert.ok(Math.abs(rg * k - albedo.y) < 0.02);
  assert.ok(Math.abs(rb * k - albedo.z) < 0.02);
});

test('sample/eval/pdf are consistent (all non-delta materials)', () => {
  const n = v3(0, 0, 1);
  const wo = norm(v3(0.35, 0.45, 0.8));
  const cases = [
    diffuse(v3(0.6, 0.5, 0.4)),
    metal(v3(0.9, 0.7, 0.3), 0.15),
    metal(v3(0.8, 0.8, 0.8), 0.45),
    coated(v3(0.2, 0.4, 0.6), 0.2, 0.5),
    coated(v3(0.7, 0.7, 0.7), 0.5, 0.8),
  ];
  for (const m of cases) {
    const r = rng(99);
    let tested = 0;
    for (let i = 0; i < 300; i++) {
      const smp = m.sample(wo, n, hit(), r);
      if (smp.pdf <= 0) continue;
      const cosNi = dot(n, smp.wi);
      assert.ok(cosNi > 0, `${m.type}: sampled below horizon`);
      const f = m.eval(wo, smp.wi, n, hit());
      const p = m.pdf(wo, smp.wi, n);
      assert.ok(Math.abs(p - smp.pdf) < 1e-9 * Math.max(1, p), `${m.type}: pdf mismatch ${p} vs ${smp.pdf}`);
      for (const ch of ['x', 'y', 'z']) {
        const expected = (f[ch] * cosNi) / p;
        assert.ok(
          Math.abs(smp.weight[ch] - expected) < 1e-7 * Math.max(1, Math.abs(expected)),
          `${m.type}: weight mismatch ${smp.weight[ch]} vs ${expected}`
        );
      }
      tested++;
    }
    assert.ok(tested > 200, `${m.type}: not enough valid samples`);
  }
});

test('metal sampling stays in the upper hemisphere and is finite', () => {
  const m = metal(v3(1, 0.8, 0.3), 0.05);
  const n = v3(0, 0, 1);
  const wo = norm(v3(0.2, 0.1, 0.97));
  const r = rng(5);
  for (let i = 0; i < 2000; i++) {
    const smp = m.sample(wo, n, hit(), r);
    if (smp.pdf <= 0) continue;
    assert.ok(dot(n, smp.wi) > 0);
    assert.ok(Number.isFinite(smp.weight.x));
    assert.ok(smp.weight.x >= 0);
  }
});

test('glass is flagged specular with the requested IOR', () => {
  const g = glass(1.52);
  assert.equal(g.type, 'glass');
  assert.equal(g.isSpecular, true);
  assert.equal(g.ior, 1.52);
});

test('emissive material returns scaled radiance', () => {
  const e = emissive(v3(1, 0.5, 0.25), 10);
  assert.deepEqual(e.emission(hit()), v3(10, 5, 2.5));
});
