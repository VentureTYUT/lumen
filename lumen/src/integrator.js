// Unbiased path tracer with next-event estimation (NEE) + multiple importance
// sampling (MIS) for area lights, plus specular reflection/refraction.
//
// Performance notes: the hot loop reuses a single mutable hit record and a
// single occlusion record so that no per-bounce hit objects are allocated.
import { v3, dot, reflect, refract, neg } from './vec3.js';

const EPS = 1e-4;
const INF = 1e30;

function misWeight(pdfA, pdfB) {
  const a2 = pdfA * pdfA;
  const b2 = pdfB * pdfB;
  const s = a2 + b2;
  return s > 0 ? a2 / s : 0;
}

function schlick(F0, cosTheta) {
  const c = 1 - cosTheta;
  const c2 = c * c;
  return F0 + (1 - F0) * c2 * c2 * c;
}

function clampVec(c, max) {
  const m = Math.max(c.x, c.y, c.z);
  if (m > max) {
    const s = max / m;
    return { x: c.x * s, y: c.y * s, z: c.z * s };
  }
  return c;
}

function newHit() {
  return {
    t: 0,
    p: { x: 0, y: 0, z: 0 },
    g: { x: 0, y: 0, z: 0 },
    n: { x: 0, y: 0, z: 0 },
    uv: [0, 0],
    mat: null,
    light: null,
  };
}

export function makeIntegrator(scene) {
  const { bvh, lights, sky, maxDepth = 8, clampValue = 40 } = scene;
  const nLights = lights.length;

  // Records reused across every sample handled by this integrator instance.
  const hit = newHit();
  const shadowHit = newHit();
  const prevPoint = { x: 0, y: 0, z: 0 };
  const wo = { x: 0, y: 0, z: 0 };
  const shadowOrigin = { x: 0, y: 0, z: 0 };

  function occluded(o, dir, tMax) {
    return bvh.intersect(o, dir, EPS, tMax, shadowHit);
  }

  function Li(o, d, rng) {
    let ro = o;
    let rd = d;
    const throughput = { x: 1, y: 1, z: 1 };
    const radiance = { x: 0, y: 0, z: 0 };
    let specular = false;
    let prevPdfBsdf = 0;
    const iorStack = [];

    for (let depth = 0; depth < maxDepth; depth++) {
      if (!bvh.intersect(ro, rd, EPS, INF, hit)) {
        const s = sky(rd);
        const c = depth === 0 ? s : clampVec(s, clampValue);
        radiance.x += throughput.x * c.x;
        radiance.y += throughput.y * c.y;
        radiance.z += throughput.z * c.z;
        break;
      }

      const mat = hit.mat;
      const p = hit.p;
      const n = hit.n;
      wo.x = -rd.x;
      wo.y = -rd.y;
      wo.z = -rd.z;

      // --- Emission: stop the path ---
      if (mat.type === 'emissive') {
        const e = mat.emission(hit);
        let w = 1;
        if (depth > 0 && !specular) {
          const pdfLight = hit.light ? hit.light.pdfSolid(prevPoint, p) : 0;
          w = misWeight(prevPdfBsdf, pdfLight / nLights);
        }
        const c = depth === 0 ? e : clampVec(e, clampValue);
        radiance.x += throughput.x * c.x * w;
        radiance.y += throughput.y * c.y * w;
        radiance.z += throughput.z * c.z * w;
        break;
      }

      // --- Specular dielectric (glass): needs the IOR stack ---
      if (mat.type === 'glass') {
        const cosi = -dot(rd, hit.g);
        const currentIor = iorStack.length ? iorStack[iorStack.length - 1] : 1.0;
        let nRefr;
        let eta;
        if (cosi > 0) {
          nRefr = hit.g;
          eta = currentIor / mat.ior;
          iorStack.push(mat.ior);
        } else {
          const outer = iorStack.length > 1 ? iorStack[iorStack.length - 2] : 1.0;
          nRefr = neg(hit.g);
          eta = mat.ior / outer;
          iorStack.pop();
        }
        const F0 = ((eta - 1) / (eta + 1)) * ((eta - 1) / (eta + 1));
        const cosTheta = Math.abs(dot(rd, hit.g));
        const Fr = schlick(F0, cosTheta);
        const refl = reflect(rd, nRefr);
        const refr = refract(rd, nRefr, eta);

        if (!refr || rng.next() < Fr) {
          ro = { x: p.x + nRefr.x * EPS, y: p.y + nRefr.y * EPS, z: p.z + nRefr.z * EPS };
          rd = refl;
        } else {
          ro = { x: p.x - nRefr.x * EPS, y: p.y - nRefr.y * EPS, z: p.z - nRefr.z * EPS };
          rd = refr;
          const k = 1 / (eta * eta);
          throughput.x *= k;
          throughput.y *= k;
          throughput.z *= k;
        }
        specular = true;
        continue;
      }

      // --- Non-specular surface: NEE + BSDF sampling ---
      const cosNo = dot(n, wo);
      if (cosNo <= 0) break;

      if (nLights > 0) {
        const light = lights[(rng.next() * nLights) | 0];
        const s = light.sampleLi(p, n, rng);
        if (s.pdf > 0) {
          const cosNi = dot(n, s.wi);
          if (cosNi > 0) {
            shadowOrigin.x = p.x + n.x * EPS;
            shadowOrigin.y = p.y + n.y * EPS;
            shadowOrigin.z = p.z + n.z * EPS;
            const tMax = s.dist < INF ? s.dist - EPS : INF;
            if (!occluded(shadowOrigin, s.wi, tMax)) {
              const f = mat.eval(wo, s.wi, n, hit);
              const pdfBsdf = mat.pdf(wo, s.wi, n);
              const pdfLightTotal = s.pdf / nLights;
              // A delta light (sun) has no continuous density to MIS against.
              const w = light.isDelta ? 1 : misWeight(pdfLightTotal, pdfBsdf);
              const scale = cosNi / pdfLightTotal;
              let cx = f.x * s.radiance.x * scale * w;
              let cy = f.y * s.radiance.y * scale * w;
              let cz = f.z * s.radiance.z * scale * w;
              if (depth > 0) {
                const m = Math.max(cx, cy, cz);
                if (m > clampValue) {
                  const sc = clampValue / m;
                  cx *= sc;
                  cy *= sc;
                  cz *= sc;
                }
              }
              radiance.x += throughput.x * cx;
              radiance.y += throughput.y * cy;
              radiance.z += throughput.z * cz;
            }
          }
        }
      }

      // BSDF sampling
      const smp = mat.sample(wo, n, hit, rng);
      if (smp.pdf <= 0) break;
      prevPdfBsdf = smp.pdf;
      prevPoint.x = p.x;
      prevPoint.y = p.y;
      prevPoint.z = p.z;
      throughput.x *= smp.weight.x;
      throughput.y *= smp.weight.y;
      throughput.z *= smp.weight.z;
      specular = false;
      ro = { x: p.x + n.x * EPS, y: p.y + n.y * EPS, z: p.z + n.z * EPS };
      rd = smp.wi;

      // Russian roulette
      if (depth >= 3) {
        const q = Math.min(Math.max(Math.max(throughput.x, throughput.y, throughput.z), 0.05), 0.95);
        if (rng.next() > q) break;
        const inv = 1 / q;
        throughput.x *= inv;
        throughput.y *= inv;
        throughput.z *= inv;
      }
    }

    return radiance;
  }

  return { Li };
}
