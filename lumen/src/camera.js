// Perspective camera with optional thin-lens depth of field.
import { v3, sub, cross, norm, len, dot } from './vec3.js';

const PI = Math.PI;

export function camera({
  position,
  lookAt,
  up = v3(0, 1, 0),
  vfov = 40,
  aspect = 4 / 3,
  aperture = 0,
  focusDist = null,
}) {
  const forward = norm(sub(lookAt, position));
  const right = norm(cross(forward, up));
  const upv = cross(right, forward);
  const tanHalf = Math.tan((vfov * 0.5 * PI) / 180);
  const halfW = tanHalf * aspect;
  const halfH = tanHalf;
  const fd = focusDist != null ? focusDist : len(sub(lookAt, position));
  const pos = position;

  return {
    forward,
    right,
    up: upv,
    generateRay(u, v, rng) {
      const x = (2 * u - 1) * halfW;
      const y = (1 - 2 * v) * halfH;
      let ox;
      let oy;
      let oz;
      if (aperture > 0) {
        const r = Math.sqrt(rng.next()) * aperture * 0.5;
        const phi = 2 * PI * rng.next();
        const lx = Math.cos(phi) * r;
        const ly = Math.sin(phi) * r;
        ox = pos.x + right.x * lx + upv.x * ly;
        oy = pos.y + right.y * lx + upv.y * ly;
        oz = pos.z + right.z * lx + upv.z * ly;
      } else {
        ox = pos.x;
        oy = pos.y;
        oz = pos.z;
      }
      const tx = pos.x + forward.x * fd + right.x * x * fd + upv.x * y * fd;
      const ty = pos.y + forward.y * fd + right.y * y * fd + upv.y * y * fd;
      const tz = pos.z + forward.z * fd + right.z * x * fd + upv.z * y * fd;
      const dx = tx - ox;
      const dy = ty - oy;
      const dz = tz - oz;
      const il = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
      return { o: { x: ox, y: oy, z: oz }, d: { x: dx * il, y: dy * il, z: dz * il } };
    },
  };
}
