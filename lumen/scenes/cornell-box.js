// Scene 1 — Classic Cornell box: area light, color bleeding, glass + metal.
import { v3 } from '../src/vec3.js';
import { quad, box, sphere } from '../src/geometry.js';
import { diffuse, metal, glass, emissive } from '../src/material.js';
import { quadLight, blackSky } from '../src/light.js';
import { camera } from '../src/camera.js';
import { makeScene, emitQuad } from '../src/scene.js';

export function buildScene(opts = {}) {
  const aspect = opts.width && opts.height ? opts.width / opts.height : 4 / 3;

  const white = diffuse(v3(0.73, 0.71, 0.68));
  const red = diffuse(v3(0.63, 0.065, 0.05));
  const green = diffuse(v3(0.14, 0.45, 0.091));

  const prims = [];
  const lights = [];

  // Room (open on the +z / camera side).
  prims.push(
    quad(v3(-1, 0, -1), v3(2, 0, 0), v3(0, 0, 2), white), // floor
    quad(v3(-1, 1, -1), v3(2, 0, 0), v3(0, 0, 2), white), // ceiling
    quad(v3(-1, 0, -1), v3(2, 0, 0), v3(0, 2, 0), white), // back
    quad(v3(-1, 0, -1), v3(0, 0, 2), v3(0, 2, 0), red), // left
    quad(v3(1, 0, -1), v3(0, 0, 2), v3(0, 2, 0), green) // right
  );

  // Ceiling area light.
  const light = emitQuad(v3(-0.4, 1 - 1e-4, -0.4), v3(0.8, 0, 0), v3(0, 0, 0.8), v3(1, 1, 1), 14);
  prims.push(light.prim);
  lights.push(light.light);

  // Objects.
  prims.push(
    ...box(v3(-0.8, 0, -0.8), v3(-0.2, 0.6, -0.2), white), // tall box
    ...box(v3(0.2, 0, -0.6), v3(0.7, 0.3, -0.1), white), // short box
    sphere(v3(0.35, 0.25, 0.35), 0.25, metal(v3(0.9, 0.9, 0.95), 0.12)), // silver
    sphere(v3(-0.4, 0.2, 0.35), 0.2, glass(1.5)) // glass
  );

  return makeScene({
    prims,
    lights,
    sky: blackSky(),
    camera: camera({
      position: v3(0, 0.5, 2.5),
      lookAt: v3(0, 0.5, 0),
      vfov: 35,
      aspect,
    }),
    maxDepth: 12,
    clampValue: 40,
  });
}
