import test from 'node:test';
import assert from 'node:assert/strict';
import { v3 } from '../src/vec3.js';
import { quad, sphere } from '../src/geometry.js';
import { diffuse, metal } from '../src/material.js';
import { sunLight, blackSky } from '../src/light.js';
import { makeScene, emitQuad } from '../src/scene.js';
import { makeIntegrator } from '../src/integrator.js';
import { rng } from '../src/rng.js';

test('direct sun on a Lambertian plane matches the analytic value', () => {
  // A white-ish floor lit from directly above by a unit directional sun.
  // Outgoing radiance = albedo/π · L_sun · cosθ = 0.8/π.
  const floor = quad(v3(-10, 0, -10), v3(20, 0, 0), v3(0, 0, 20), diffuse(v3(0.8, 0.8, 0.8)));
  const scene = makeScene({
    prims: [floor],
    lights: [sunLight(v3(0, 1, 0), v3(1, 1, 1))],
    sky: blackSky(),
    camera: null,
    maxDepth: 4,
    clampValue: 40,
  });
  const { Li } = makeIntegrator(scene);
  const r = rng(1);
  const c = Li(v3(0, 1, 0), v3(0, -1, 0), r);
  const expected = 0.8 / Math.PI;
  assert.ok(Math.abs(c.x - expected) < 1e-9, `got ${c.x}, expected ${expected}`);
  assert.ok(Math.abs(c.y - expected) < 1e-9);
  assert.ok(Math.abs(c.z - expected) < 1e-9);
});

test('sun contribution scales linearly with sun radiance', () => {
  const mk = (rad) =>
    makeScene({
      prims: [quad(v3(-10, 0, -10), v3(20, 0, 0), v3(0, 0, 20), diffuse(v3(0.5, 0.5, 0.5)))],
      lights: [sunLight(v3(0, 1, 0), v3(rad, rad, rad))],
      sky: blackSky(),
      camera: null,
      maxDepth: 4,
      clampValue: 100,
    });
  const a = makeIntegrator(mk(1)).Li(v3(0, 1, 0), v3(0, -1, 0), rng(2));
  const b = makeIntegrator(mk(3)).Li(v3(0, 1, 0), v3(0, -1, 0), rng(2));
  assert.ok(Math.abs(b.x - 3 * a.x) < 1e-9);
});

test('area light + metal scene yields finite non-negative radiance', () => {
  const light = emitQuad(v3(-0.5, 2, -0.5), v3(1, 0, 0), v3(0, 0, 1), v3(1, 1, 1), 30);
  const scene = makeScene({
    prims: [
      quad(v3(-5, 0, -5), v3(10, 0, 0), v3(0, 0, 10), diffuse(v3(0.6, 0.6, 0.6))),
      sphere(v3(0, 0.5, 0), 0.5, metal(v3(0.9, 0.9, 0.9), 0.1)),
      light.prim,
    ],
    lights: [light.light],
    sky: blackSky(),
    camera: null,
    maxDepth: 8,
    clampValue: 40,
  });
  const { Li } = makeIntegrator(scene);
  const r = rng(4);
  for (let i = 0; i < 64; i++) {
    const o = v3((r.next() - 0.5) * 0.4, 0.9, (r.next() - 0.5) * 0.4);
    const d = v3((r.next() - 0.5) * 0.2, -1, (r.next() - 0.5) * 0.2);
    const il = 1 / Math.hypot(d.x, d.y, d.z);
    const c = Li(o, { x: d.x * il, y: d.y * il, z: d.z * il }, r);
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z));
    assert.ok(c.x >= 0 && c.y >= 0 && c.z >= 0);
  }
});

test('an occluded shadow receives no direct sun', () => {
  // Floor + a black blocker directly between the sun and the sample point.
  const floor = quad(v3(-10, 0, -10), v3(20, 0, 0), v3(0, 0, 20), diffuse(v3(1, 1, 1)));
  const blocker = sphere(v3(0, 1, 0), 0.5, diffuse(v3(0, 0, 0)));
  const scene = makeScene({
    prims: [floor, blocker],
    lights: [sunLight(v3(0, 1, 0), v3(1, 1, 1))],
    sky: blackSky(),
    camera: null,
    maxDepth: 4,
    clampValue: 40,
  });
  const { Li } = makeIntegrator(scene);
  // Aim at the floor point directly under the blocker; the sun ray is blocked.
  const c = Li(v3(0, 1, 1.2), v3(0, -1, -1.2), rng(9));
  assert.ok(c.x < 1e-6, `shadowed pixel should be dark, got ${c.x}`);
});
