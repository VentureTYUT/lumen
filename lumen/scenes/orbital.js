// Scene 3 — "Orbital": chrome torus knot over a glossy marble floor at sunset,
// with depth of field, a glass sphere and noise-displaced rocks.
import { v3 } from '../src/vec3.js';
import { quad, sphere, torusKnotMesh, icosphereMesh } from '../src/geometry.js';
import { metal, glass, coated, checker, fbm } from '../src/material.js';
import { gradientSky, sunLight } from '../src/light.js';
import { camera } from '../src/camera.js';
import { makeScene } from '../src/scene.js';

export function buildScene(opts = {}) {
  const aspect = opts.width && opts.height ? opts.width / opts.height : 4 / 3;

  const sunDir = v3(-0.45, 0.65, -0.35);

  const prims = [];
  const lights = [];

  // Marble checker floor with a soft clearcoat.
  const floor = coated(
    checker(v3(0.02, 0.02, 0.03), v3(0.35, 0.33, 0.30), 0.6),
    0.3,
    0.55
  );
  prims.push(quad(v3(-14, 0, -14), v3(28, 0, 0), v3(0, 0, 28), floor));

  // Chrome trefoil knot (procedural Frenet-frame tube), floating above the floor.
  const chrome = metal(v3(0.96, 0.96, 1.0), 0.03);
  prims.push(
    ...torusKnotMesh({
      p: 2, q: 3, R: 0.55, r: 0.18, tube: 0.07, nt: 220, nphi: 40, material: chrome,
      offset: v3(0, 1.05, 0),
    })
  );

  // Glass companion sphere.
  prims.push(sphere(v3(-1.25, 0.4, 0.9), 0.4, glass(1.52)));

  // Noise-displaced rocks for scale and grounding.
  const rock = (center, size) =>
    icosphereMesh({
      radius: size,
      subdiv: 2,
      material: coated(v3(0.32, 0.3, 0.28), 0.7, 0.25),
      displace: (d) =>
        fbm(
          { x: d.x * 1.6 + center.x, y: d.y * 1.6 + center.y, z: d.z * 1.6 + center.z },
          5
        ) * 0.35 - 0.12,
    });
  prims.push(...rock(v3(1.5, 0, 1.6), 0.4));
  prims.push(...rock(v3(-1.7, 0, 1.9), 0.3));
  prims.push(...rock(v3(1.1, 0, -2.2), 0.28));

  // Warm directional sun.
  lights.push(sunLight(sunDir, v3(18, 15, 11)));

  return makeScene({
    prims,
    lights,
    sky: gradientSky({
      zenith: v3(0.03, 0.07, 0.16),
      horizon: v3(0.18, 0.10, 0.06),
      ground: v3(0.02, 0.02, 0.02),
      sunDir,
      sunColor: v3(1, 0.9, 0.7),
      sunStrength: 400,
      sunSharpness: 1200,
    }),
    camera: camera({
      position: v3(2.9, 1.9, 4.3),
      lookAt: v3(0, 1.0, 0),
      vfov: 35,
      aspect,
      aperture: 0.14,
      focusDist: 5.0,
    }),
    maxDepth: 12,
    clampValue: 60,
  });
}
