// Scene assembly + light-building helpers.
import { buildBVH, quad, sphere } from './geometry.js';
import { emissive } from './material.js';
import { quadLight, sphereLight } from './light.js';

export function makeScene({ prims, lights, sky, camera, maxDepth = 8, clampValue = 40 }) {
  const bvh = buildBVH(prims);
  return { prims, lights, sky, camera, maxDepth, clampValue, bvh };
}

// Create an emissive quad + its area light, wired together.
export function emitQuad(origin, u, v, color, strength = 1) {
  const mat = emissive(color, strength);
  const light = quadLight(origin, u, v, mat);
  mat.light = light;
  const prim = quad(origin, u, v, mat);
  return { prim, light };
}

// Create an emissive sphere + its sphere light, wired together.
export function emitSphere(center, radius, color, strength = 1) {
  const mat = emissive(color, strength);
  const light = sphereLight(center, radius, mat);
  mat.light = light;
  const prim = sphere(center, radius, mat);
  return { prim, light };
}
