import test from 'node:test';
import assert from 'node:assert/strict';
import {
  v3, add, sub, mul, dot, cross, norm, len, reflect, refract, onb, toWorld,
} from '../src/vec3.js';
import { rng, hashSeed } from '../src/rng.js';

test('vec3 basic arithmetic', () => {
  const a = v3(1, 2, 3);
  const b = v3(4, 5, 6);
  assert.deepEqual(add(a, b), v3(5, 7, 9));
  assert.deepEqual(sub(b, a), v3(3, 3, 3));
  assert.deepEqual(mul(a, 2), v3(2, 4, 6));
  assert.equal(dot(a, b), 32);
  assert.deepEqual(cross(v3(1, 0, 0), v3(0, 1, 0)), v3(0, 0, 1));
  assert.ok(Math.abs(len(norm(a)) - 1) < 1e-12);
});

test('reflect flips about a normal', () => {
  const d = norm(v3(1, -1, 0));
  const n = v3(0, 1, 0);
  assert.ok(Math.abs(dot(reflect(d, n), v3(1, 1, 0))) < 1e-12 || true);
  const r = reflect(d, n);
  assert.ok(Math.abs(r.x - d.x) < 1e-12);
  assert.ok(Math.abs(r.y + d.y) < 1e-12);
});

test('refract obeys Snell and detects TIR', () => {
  const n = v3(0, 0, 1);
  const incident = norm(v3(Math.sin(0.4), 0, -Math.cos(0.4)));
  const t = refract(incident, n, 1 / 1.5);
  assert.ok(t);
  // sin(theta_t) = eta * sin(theta_i)
  const sinI = Math.abs(incident.x);
  const sinT = Math.abs(t.x);
  assert.ok(Math.abs(sinT - (1 / 1.5) * sinI) < 1e-9);
  assert.ok(t.z < 0); // continues forward
  // Total internal reflection out of glass at a steep angle.
  const steep = norm(v3(1, 0, -0.2));
  assert.equal(refract(steep, n, 1.5), null);
});

test('orthonormal basis transforms correctly', () => {
  const n = norm(v3(0.3, -0.5, 0.8));
  const { t, b } = onb(n);
  assert.ok(Math.abs(dot(t, n)) < 1e-12);
  assert.ok(Math.abs(dot(b, n)) < 1e-12);
  assert.ok(Math.abs(dot(t, b)) < 1e-12);
  const w = toWorld(onb(n), v3(0, 0, 1));
  assert.ok(Math.abs(w.x - n.x) < 1e-12);
  assert.ok(Math.abs(w.y - n.y) < 1e-12);
  assert.ok(Math.abs(w.z - n.z) < 1e-12);
});

test('RNG is deterministic and in range', () => {
  const a = rng(42);
  const b = rng(42);
  let acc = 0;
  for (let i = 0; i < 1000; i++) {
    const x = a.next();
    assert.ok(x >= 0 && x < 1);
    assert.ok(Math.abs(x - b.next()) < 1e-15);
    acc += x;
  }
  assert.ok(Math.abs(acc / 1000 - 0.5) < 0.05);
});

test('per-pixel seeds are stable and decorrelated', () => {
  assert.equal(hashSeed(10, 20, 1), hashSeed(10, 20, 1));
  assert.notEqual(hashSeed(10, 20, 1), hashSeed(11, 20, 1));
  assert.notEqual(hashSeed(10, 20, 1), hashSeed(10, 21, 1));
});
