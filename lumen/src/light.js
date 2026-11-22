// Area lights (quad/sphere) and a delta directional sun, plus sky helpers.
import { v3, add, sub, mul, dot, cross, len, norm, neg, onb, toWorld } from './vec3.js';

const PI = Math.PI;

// Quad light (parallelogram area light). `mat` must be an emissive material.
export function quadLight(origin, u, v, mat) {
  const g = norm(cross(u, v));
  const area = len(cross(u, v));
  const light = {
    type: 'quad',
    mat,
    origin,
    u,
    v,
    normal: g,
    area,
    sampleLi(p, n, rng) {
      const a = rng.next();
      const b = rng.next();
      const point = {
        x: origin.x + u.x * a + v.x * b,
        y: origin.y + u.y * a + v.y * b,
        z: origin.z + u.z * a + v.z * b,
      };
      const d = { x: point.x - p.x, y: point.y - p.y, z: point.z - p.z };
      const d2 = dot(d, d);
      const dist = Math.sqrt(d2);
      const wi = { x: d.x / dist, y: d.y / dist, z: d.z / dist };
      const cosL = -dot(g, wi);
      if (cosL <= 1e-6 || dist < 1e-6) {
        return { wi, radiance: v3(0, 0, 0), pdf: 0, dist };
      }
      const pdf = d2 / (cosL * area);
      const radiance = mat.emission({ p: point, uv: [a, b], n: g, g });
      return { wi, radiance, pdf, dist };
    },
    pdfSolid(p, hp) {
      const d = { x: hp.x - p.x, y: hp.y - p.y, z: hp.z - p.z };
      const d2 = dot(d, d);
      const dist = Math.sqrt(d2);
      if (dist < 1e-6) return 0;
      const wi = { x: d.x / dist, y: d.y / dist, z: d.z / dist };
      const cosL = -dot(g, wi);
      if (cosL <= 1e-6) return 0;
      return d2 / (cosL * area);
    },
  };
  return light;
}

// Sphere light.
export function sphereLight(center, radius, mat) {
  const r2 = radius * radius;
  const light = {
    type: 'sphere',
    mat,
    center,
    radius,
    sampleLi(p, n, rng) {
      const d = { x: center.x - p.x, y: center.y - p.y, z: center.z - p.z };
      const d2 = dot(d, d);
      const distC = Math.sqrt(d2);
      let wi;
      let pdf;
      let dist;
      let point;
      if (distC < radius) {
        // inside the light (rare) — sample direction uniformly on sphere
        const u1 = rng.next();
        const u2 = rng.next();
        const z = 1 - 2 * u1;
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        const phi = 2 * PI * u2;
        wi = { x: r * Math.cos(phi), y: r * Math.sin(phi), z };
        pdf = 1 / (4 * PI);
        const b = dot(wi, d);
        dist = b + Math.sqrt(Math.max(0, b * b - (d2 - r2)));
        point = { x: p.x + wi.x * dist, y: p.y + wi.y * dist, z: p.z + wi.z * dist };
      } else {
        const cosThetaMax = Math.sqrt(Math.max(0, 1 - r2 / d2));
        const u1 = rng.next();
        const u2 = rng.next();
        const cosTheta = 1 - u1 * (1 - cosThetaMax);
        const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
        const phi = 2 * PI * u2;
        const basis = onb({ x: d.x / distC, y: d.y / distC, z: d.z / distC });
        wi = toWorld(basis, { x: sinTheta * Math.cos(phi), y: sinTheta * Math.sin(phi), z: cosTheta });
        pdf = 1 / (2 * PI * (1 - cosThetaMax));
        const b = dot(wi, d);
        dist = b - Math.sqrt(Math.max(0, b * b - (d2 - r2)));
        point = { x: p.x + wi.x * dist, y: p.y + wi.y * dist, z: p.z + wi.z * dist };
      }
      if (!(dist > 0)) {
        return { wi, radiance: v3(0, 0, 0), pdf: 0, dist };
      }
      const radiance = mat.emission({ p: point, uv: [0, 0], n: neg(wi), g: neg(wi) });
      return { wi, radiance, pdf, dist };
    },
    pdfSolid(p, hp) {
      const d = { x: hp.x - p.x, y: hp.y - p.y, z: hp.z - p.z };
      const d2 = dot(d, d);
      const distC = Math.sqrt(d2);
      if (distC < radius) return 1 / (4 * PI);
      const cosThetaMax = Math.sqrt(Math.max(0, 1 - r2 / d2));
      return 1 / (2 * PI * (1 - cosThetaMax));
    },
  };
  return light;
}

// Directional (delta) sun.
export function sunLight(direction, radiance) {
  const dir = norm(direction);
  return {
    type: 'sun',
    isDelta: true,
    dir,
    radiance,
    sampleLi(p, n, rng) {
      return { wi: dir, radiance, pdf: 1, dist: Infinity };
    },
    pdfSolid() {
      return 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Sky helpers (return radiance for a direction)
// ---------------------------------------------------------------------------

export function blackSky() {
  return () => v3(0, 0, 0);
}

// Vertical gradient sky with optional sun glow (radiance in W·sr⁻¹·m⁻²).
export function gradientSky({ zenith, horizon, ground, sunDir = null, sunColor = v3(1, 0.9, 0.7), sunStrength = 50, sunSharpness = 300 }) {
  const zUp = zenith;
  const hUp = horizon;
  const gUp = ground;
  return (dir) => {
    const t = dir.y; // up
    let col;
    if (t >= 0) {
      const k = Math.pow(1 - t, 1.5);
      col = {
        x: hUp.x * k + zUp.x * (1 - k),
        y: hUp.y * k + zUp.y * (1 - k),
        z: hUp.z * k + zUp.z * (1 - k),
      };
    } else {
      const k = Math.pow(1 + t, 1.5);
      col = {
        x: hUp.x * k + gUp.x * (1 - k),
        y: hUp.y * k + gUp.y * (1 - k),
        z: hUp.z * k + gUp.z * (1 - k),
      };
    }
    if (sunDir) {
      const c = Math.max(0, dot(dir, sunDir));
      const g = Math.pow(c, sunSharpness) * sunStrength;
      col.x += sunColor.x * g;
      col.y += sunColor.y * g;
      col.z += sunColor.z * g;
    }
    return col;
  };
}
