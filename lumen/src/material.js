// Materials (BSDFs) + procedural textures.
import { v3, dot, norm, onb, toWorld, mirror } from './vec3.js';

// ---------------------------------------------------------------------------
// Procedural noise + textures
// ---------------------------------------------------------------------------

function hash3(x, y, z) {
  // Integer hash -> [0,1)
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2246822519)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967296;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(p) {
  const x0 = Math.floor(p.x);
  const y0 = Math.floor(p.y);
  const z0 = Math.floor(p.z);
  const fx = smoothstep(p.x - x0);
  const fy = smoothstep(p.y - y0);
  const fz = smoothstep(p.z - z0);
  const c000 = hash3(x0, y0, z0);
  const c100 = hash3(x0 + 1, y0, z0);
  const c010 = hash3(x0, y0 + 1, z0);
  const c110 = hash3(x0 + 1, y0 + 1, z0);
  const c001 = hash3(x0, y0, z0 + 1);
  const c101 = hash3(x0 + 1, y0, z0 + 1);
  const c011 = hash3(x0, y0 + 1, z0 + 1);
  const c111 = hash3(x0 + 1, y0 + 1, z0 + 1);
  const x00 = c000 + (c100 - c000) * fx;
  const x10 = c010 + (c110 - c010) * fx;
  const x01 = c001 + (c101 - c001) * fx;
  const x11 = c011 + (c111 - c011) * fx;
  const a = x00 + (x10 - x00) * fy;
  const b = x01 + (x11 - x01) * fy;
  return a + (b - a) * fz;
}

export function fbm(p, octaves = 5) {
  let f = 0;
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  for (let i = 0; i < octaves; i++) {
    f += amp * valueNoise({ x: p.x * freq, y: p.y * freq, z: p.z * freq });
    sum += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return f / sum;
}

export const solid = (color) => () => color;

export const checker = (c1, c2, scale = 1) => (hit) => {
  const s = scale;
  const c = Math.floor(hit.p.x * s) + Math.floor(hit.p.y * s) + Math.floor(hit.p.z * s);
  return (c & 1) === 0 ? c1 : c2;
};

export const worldNoise = (base, amplitude, octaves = 4) => (hit) => {
  const n = fbm(hit.p, octaves);
  return {
    x: base.x * (1 - amplitude + 2 * amplitude * n),
    y: base.y * (1 - amplitude + 2 * amplitude * n),
    z: base.z * (1 - amplitude + 2 * amplitude * n),
  };
};

// ---------------------------------------------------------------------------
// BSDFs
// ---------------------------------------------------------------------------

const PI = Math.PI;

function cosHemisphereSample(n, rng) {
  const u1 = rng.next();
  const u2 = rng.next();
  const r = Math.sqrt(u1);
  const phi = 2 * PI * u2;
  const local = { x: r * Math.cos(phi), y: r * Math.sin(phi), z: Math.sqrt(1 - u1) };
  return toWorld(onb(n), local);
}

function schlick(F0, cosTheta) {
  const c = 1 - cosTheta;
  const c2 = c * c;
  return F0 + (1 - F0) * c2 * c2 * c;
}

function schlickVec(F0, cosTheta) {
  const c = 1 - cosTheta;
  const c2 = c * c;
  const k = c2 * c2 * c;
  return {
    x: F0.x + (1 - F0.x) * k,
    y: F0.y + (1 - F0.y) * k,
    z: F0.z + (1 - F0.z) * k,
  };
}

// Trowbridge–Reitz (GGX) normal distribution.
function ggxD(alpha, cosThetaH) {
  const a2 = alpha * alpha;
  const c2 = cosThetaH * cosThetaH;
  const d = c2 * (a2 - 1) + 1;
  return a2 / (PI * d * d);
}

function ggxG1(alpha, cosTheta) {
  if (cosTheta <= 0) return 0;
  const a2 = alpha * alpha;
  const tan2 = (1 - cosTheta * cosTheta) / (cosTheta * cosTheta);
  return 2 / (1 + Math.sqrt(1 + a2 * tan2));
}

function ggxG(alpha, cosNo, cosNi) {
  return ggxG1(alpha, cosNo) * ggxG1(alpha, cosNi);
}

// Sample a half-vector distributed by the GGX NDF (local frame, n = +z).
function sampleGGXHalf(alpha, rng) {
  const u1 = rng.next();
  const u2 = rng.next();
  const phi = 2 * PI * u2;
  const cosTheta = Math.sqrt((1 - u1) / (1 + (alpha * alpha - 1) * u1));
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  return {
    x: sinTheta * Math.cos(phi),
    y: sinTheta * Math.sin(phi),
    z: cosTheta,
  };
}

export function diffuse(albedo) {
  const getAlbedo = typeof albedo === 'function' ? albedo : solid(albedo);
  return {
    type: 'diffuse',
    isSpecular: false,
    albedoAt: getAlbedo,
    sample(wo, n, hit, rng) {
      const wi = cosHemisphereSample(n, rng);
      const cosNi = dot(n, wi);
      const pdf = cosNi / PI;
      const a = getAlbedo(hit);
      return { wi, pdf, weight: a };
    },
    eval(wo, wi, n, hit) {
      if (dot(n, wi) <= 0 || dot(n, wo) <= 0) return v3(0, 0, 0);
      const a = getAlbedo(hit);
      const invPi = 1 / PI;
      return { x: a.x * invPi, y: a.y * invPi, z: a.z * invPi };
    },
    pdf(wo, wi, n) {
      const cosNi = dot(n, wi);
      return cosNi > 0 ? cosNi / PI : 0;
    },
    emission() {
      return null;
    },
  };
}

export function metal(color, roughness = 0.2) {
  const F0 = color;
  const alpha = Math.max(roughness, 1e-3);
  return {
    type: 'metal',
    isSpecular: false,
    roughness,
    albedoAt: () => color,
    sample(wo, n, hit, rng) {
      const basis = onb(n);
      const cosNo = Math.max(dot(n, wo), 1e-5);
      for (let attempt = 0; attempt < 16; attempt++) {
        const hLocal = sampleGGXHalf(alpha, rng);
        const h = toWorld(basis, hLocal);
        const woDotH = dot(wo, h);
        if (woDotH <= 0) continue;
        const wi = mirror(wo, h); // 2(wo·h)h - wo
        const cosNi = dot(n, wi);
        if (cosNi <= 0) continue;
        const cosThetaH = hLocal.z;
        const D = ggxD(alpha, cosThetaH);
        const pdf = (D * cosThetaH) / (4 * woDotH);
        const F = schlickVec(F0, woDotH);
        const G = ggxG(alpha, cosNo, cosNi);
        const k = (G * woDotH) / (cosNo * cosThetaH);
        return { wi, pdf, weight: v3(F.x * k, F.y * k, F.z * k) };
      }
      return { wi: n, pdf: 0, weight: v3(0, 0, 0) };
    },
    eval(wo, wi, n) {
      const cosNo = dot(n, wo);
      const cosNi = dot(n, wi);
      if (cosNo <= 0 || cosNi <= 0) return v3(0, 0, 0);
      const h = norm({ x: wo.x + wi.x, y: wo.y + wi.y, z: wo.z + wi.z });
      const cosThetaH = Math.max(dot(n, h), 0);
      const woDotH = dot(wo, h);
      if (cosThetaH <= 0 || woDotH <= 0) return v3(0, 0, 0);
      const D = ggxD(alpha, cosThetaH);
      const G = ggxG(alpha, cosNo, cosNi);
      const F = schlickVec(F0, woDotH);
      const k = (D * G) / (4 * cosNo * cosNi);
      return v3(F.x * k, F.y * k, F.z * k);
    },
    pdf(wo, wi, n) {
      const cosNo = dot(n, wo);
      const cosNi = dot(n, wi);
      if (cosNo <= 0 || cosNi <= 0) return 0;
      const h = norm({ x: wo.x + wi.x, y: wo.y + wi.y, z: wo.z + wi.z });
      const cosThetaH = Math.max(dot(n, h), 0);
      const woDotH = dot(wo, h);
      if (woDotH <= 0) return 0;
      return (ggxD(alpha, cosThetaH) * cosThetaH) / (4 * woDotH);
    },
    emission() {
      return null;
    },
  };
}

export function glass(ior = 1.5) {
  return {
    type: 'glass',
    isSpecular: true,
    ior,
    albedoAt: () => v3(1, 1, 1),
    sample() {
      throw new Error('glass is handled by the integrator');
    },
    eval() {
      return v3(0, 0, 0);
    },
    pdf() {
      return 0;
    },
    emission() {
      return null;
    },
  };
}

// Diffuse + GGX clearcoat (glossy paint / polished floors). `spec` is the
// probability of sampling the specular lobe (also its energy share).
export function coated(albedo, roughness = 0.3, spec = 0.5) {
  const getAlbedo = typeof albedo === 'function' ? albedo : solid(albedo);
  const alpha = Math.max(roughness, 1e-3);
  const F0 = 0.04;
  const ps = spec;

  // Mixture BSDF f(wo, wi) (does NOT include cosine).
  function fTotal(wo, wi, n, a) {
    const cosNo = dot(n, wo);
    const cosNi = dot(n, wi);
    if (cosNo <= 0 || cosNi <= 0) return v3(0, 0, 0);
    const fd = ((1 - ps) / PI) * 1;
    const h = norm({ x: wo.x + wi.x, y: wo.y + wi.y, z: wo.z + wi.z });
    const cosThetaH = Math.max(dot(n, h), 0);
    const woDotH = dot(wo, h);
    let fs = 0;
    if (cosThetaH > 0 && woDotH > 0) {
      const D = ggxD(alpha, cosThetaH);
      const G = ggxG(alpha, cosNo, cosNi);
      const F = schlick(F0, woDotH);
      fs = (ps * D * G * F) / (4 * cosNo * cosNi);
    }
    return { x: a.x * fd + fs, y: a.y * fd + fs, z: a.z * fd + fs };
  }

  // Mixture sampling density (solid angle).
  function pMix(wo, wi, n) {
    const cosNo = dot(n, wo);
    const cosNi = dot(n, wi);
    if (cosNo <= 0 || cosNi <= 0) return 0;
    const h = norm({ x: wo.x + wi.x, y: wo.y + wi.y, z: wo.z + wi.z });
    const cosThetaH = Math.max(dot(n, h), 0);
    const woDotH = dot(wo, h);
    let pggx = 0;
    if (cosThetaH > 0 && woDotH > 0) pggx = (ggxD(alpha, cosThetaH) * cosThetaH) / (4 * woDotH);
    return (1 - ps) * (cosNi / PI) + ps * pggx;
  }

  return {
    type: 'coated',
    isSpecular: false,
    albedoAt: getAlbedo,
    sample(wo, n, hit, rng) {
      let wi = null;
      if (rng.next() < ps) {
        const basis = onb(n);
        const cosNo = Math.max(dot(n, wo), 1e-5);
        for (let attempt = 0; attempt < 16; attempt++) {
          const hLocal = sampleGGXHalf(alpha, rng);
          const h = toWorld(basis, hLocal);
          const woDotH = dot(wo, h);
          if (woDotH <= 0) continue;
          const cand = mirror(wo, h);
          if (dot(n, cand) <= 0) continue;
          wi = cand;
          break;
        }
      } else {
        wi = cosHemisphereSample(n, rng);
      }
      if (!wi) return { wi: n, pdf: 0, weight: v3(0, 0, 0) };
      const cosNi = dot(n, wi);
      if (cosNi <= 0) return { wi: n, pdf: 0, weight: v3(0, 0, 0) };
      const a = getAlbedo(hit);
      const f = fTotal(wo, wi, n, a);
      const pm = pMix(wo, wi, n);
      if (!(pm > 0)) return { wi, pdf: 0, weight: v3(0, 0, 0) };
      const s = cosNi / pm;
      return { wi, pdf: pm, weight: v3(f.x * s, f.y * s, f.z * s) };
    },
    eval(wo, wi, n, hit) {
      return fTotal(wo, wi, n, getAlbedo(hit));
    },
    pdf(wo, wi, n) {
      return pMix(wo, wi, n);
    },
    emission() {
      return null;
    },
  };
}

export function emissive(color, strength = 1) {
  const c = typeof color === 'function' ? color : solid(color);
  return {
    type: 'emissive',
    isSpecular: false,
    light: null,
    emission(hit) {
      const e = c(hit);
      return { x: e.x * strength, y: e.y * strength, z: e.z * strength };
    },
    albedoAt: () => v3(0, 0, 0),
    sample() {
      return { wi: v3(0, 0, 1), pdf: 0, weight: v3(0, 0, 0) };
    },
    eval() {
      return v3(0, 0, 0);
    },
    pdf() {
      return 0;
    },
  };
}
