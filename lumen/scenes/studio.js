// Scene 2 — Studio "material study": a bright cyclorama room with a dark glossy
// floor, four softboxes and a lineup of spheres showing the material range.
import { v3 } from '../src/vec3.js';
import { quad, sphere } from '../src/geometry.js';
import { diffuse, metal, glass, coated } from '../src/material.js';
import { blackSky } from '../src/light.js';
import { camera } from '../src/camera.js';
import { makeScene, emitQuad } from '../src/scene.js';

export function buildScene(opts = {}) {
  const aspect = opts.width && opts.height ? opts.width / opts.height : 4 / 3;

  // Room dimensions.
  const X = 5;
  const Y = 6;
  const Z0 = -4;
  const Z1 = 7;

  const wall = diffuse((hit) => {
    const t = Math.min(1, Math.max(0, hit.p.y / Y));
    const g = 0.10 + 0.32 * t * t;
    return v3(g, g, g * 1.06);
  });
  const floor = coated(v3(0.08, 0.08, 0.095), 0.08, 0.65);

  const prims = [];
  const lights = [];

  // Cyclorama room (camera lives inside, so the front wall is omitted).
  prims.push(
    quad(v3(-X, 0, Z0), v3(2 * X, 0, 0), v3(0, 0, Z1 - Z0), floor), // floor
    quad(v3(-X, Y, Z0), v3(2 * X, 0, 0), v3(0, 0, Z1 - Z0), wall), // ceiling
    quad(v3(-X, 0, Z0), v3(2 * X, 0, 0), v3(0, Y, 0), wall), // back
    quad(v3(-X, 0, Z0), v3(0, 0, Z1 - Z0), v3(0, Y, 0), wall), // left
    quad(v3(X, 0, Z0), v3(0, 0, Z1 - Z0), v3(0, Y, 0), wall) // right
  );

  // Softboxes.
  const overhead = emitQuad(v3(-2, Y - 0.05, 1.5), v3(7, 0, 0), v3(0, 0, 5.5), v3(1, 1, 1), 12);
  const key = emitQuad(v3(-4.9, 4.0, 2.0), v3(0, 2.5, 0), v3(0, 0, 2.5), v3(1, 0.97, 0.92), 18);
  const rim = emitQuad(v3(0, 3.6, Z0 + 0.1), v3(4.5, 0, 0), v3(0, 2.6, 0), v3(1, 0.55, 0.32), 28);
  const fill = emitQuad(v3(4.9, 4.6, 2.0), v3(0, 2.2, 0), v3(0, 0, 2.2), v3(0.8, 0.88, 1.0), 10);
  prims.push(overhead.prim, key.prim, rim.prim, fill.prim);
  lights.push(overhead.light, key.light, rim.light, fill.light);

  // Material lineup.
  const r = 0.3;
  const y = r;
  const z = 0.2;
  const xs = [-2.1, -1.4, -0.7, 0, 0.7, 1.4, 2.1];
  const mats = [
    diffuse(v3(0.82, 0.2, 0.2)), // matte red
    metal(v3(0.95, 0.95, 0.97), 0.02), // mirror chrome
    metal(v3(0.85, 0.85, 0.88), 0.18), // brushed silver
    glass(1.52), // glass
    metal(v3(1.0, 0.72, 0.25), 0.25), // gold
    metal(v3(0.7, 0.7, 0.72), 0.55), // rough aluminum
    coated(v3(0.04, 0.09, 0.22), 0.12, 0.75), // car-paint blue
  ];
  for (let i = 0; i < xs.length; i++) {
    prims.push(sphere(v3(xs[i], y, z), r, mats[i]));
  }

  return makeScene({
    prims,
    lights,
    sky: blackSky(),
    camera: camera({
      position: v3(0, 1.55, 5.6),
      lookAt: v3(0, 0.9, -0.3),
      vfov: 30,
      aspect,
    }),
    maxDepth: 12,
    clampValue: 40,
  });
}
