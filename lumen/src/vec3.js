// Minimal, allocation-light 3D vector math for the hot path.
// Vectors are plain {x,y,z} objects with a monomorphic shape; helpers never
// mutate their inputs unless the name starts with a destination argument.

export function v3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function copy(a) {
  return { x: a.x, y: a.y, z: a.z };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function mul(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function mulV(a, b) {
  return { x: a.x * b.x, y: a.y * b.y, z: a.z * b.z };
}

export function neg(a) {
  return { x: -a.x, y: -a.y, z: -a.z };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function len(a) {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function len2(a) {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function norm(a) {
  const l = len(a);
  if (l === 0) return { x: 0, y: 0, z: 0 };
  const inv = 1 / l;
  return { x: a.x * inv, y: a.y * inv, z: a.z * inv };
}

// Component-wise min/max for AABB construction.
export function minV(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) };
}

export function maxV(a, b) {
  return { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) };
}

export function lerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

// Reflect w about normal n (both unit).
export function reflect(w, n) {
  const d = 2 * dot(w, n);
  return { x: w.x - d * n.x, y: w.y - d * n.y, z: w.z - d * n.z };
}

// Mirror an *outgoing* direction wo about the half-vector h: wi = 2(wo·h)h - wo.
export function mirror(wo, h) {
  const d = 2 * dot(wo, h);
  return { x: d * h.x - wo.x, y: d * h.y - wo.y, z: d * h.z - wo.z };
}

// Refract w about normal n; returns null on total internal reflection.
export function refract(w, n, eta) {
  const cosi = -dot(w, n);
  const sin2t = eta * eta * (1 - cosi * cosi);
  if (sin2t > 1) return null;
  const cost = Math.sqrt(1 - sin2t);
  return {
    x: eta * w.x + (eta * cosi - cost) * n.x,
    y: eta * w.y + (eta * cosi - cost) * n.y,
    z: eta * w.z + (eta * cosi - cost) * n.z,
  };
}

// Orthonormal basis from a unit vector n (Duff et al. 2017).
export function onb(n) {
  const sign = n.z >= 0 ? 1 : -1;
  const a = -1 / (sign + n.z);
  const b = n.x * n.y * a;
  return {
    t: { x: 1 + sign * n.x * n.x * a, y: sign * b, z: -sign * n.x },
    b: { x: b, y: sign + n.y * n.y * a, z: -n.y },
    n,
  };
}

// Map a point on the unit sphere (about origin) into the ONB frame.
export function toWorld(basis, local) {
  return {
    x: local.x * basis.t.x + local.y * basis.b.x + local.z * basis.n.x,
    y: local.x * basis.t.y + local.y * basis.b.y + local.z * basis.n.y,
    z: local.x * basis.t.z + local.y * basis.b.z + local.z * basis.n.z,
  };
}

export function isFiniteVec(a) {
  return Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);
}

export function eq(a, b, eps = 1e-9) {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.z - b.z) < eps
  );
}
