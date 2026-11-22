// Geometry: ray, AABB, primitives (sphere/quad/triangle/mesh), and a BVH.
import {
  v3, add, sub, mul, dot, cross, len, len2, norm, minV, maxV, neg,
} from './vec3.js';

// ---------------------------------------------------------------------------
// Ray
// ---------------------------------------------------------------------------
export function ray(o, d) {
  return {
    o,
    d,
    invD: { x: 1 / d.x, y: 1 / d.y, z: 1 / d.z },
  };
}

// ---------------------------------------------------------------------------
// AABB
// ---------------------------------------------------------------------------
export function emptyBox() {
  return {
    min: v3(Infinity, Infinity, Infinity),
    max: v3(-Infinity, -Infinity, -Infinity),
  };
}

export function unionBox(a, b) {
  return { min: minV(a.min, b.min), max: maxV(a.max, b.max) };
}

export function growBox(box, p) {
  return { min: minV(box.min, p), max: maxV(box.max, p) };
}

// Slab test; returns hit distance or -1. o/d/inv are scalars from the ray.
export function boxHit(box, ox, oy, oz, invX, invY, invZ, tMin, tMax) {
  let t0 = tMin;
  let t1 = tMax;

  {
    const tmin = (box.min.x - ox) * invX;
    const tmax = (box.max.x - ox) * invX;
    if (invX >= 0) {
      if (tmin > t0) t0 = tmin;
      if (tmax < t1) t1 = tmax;
    } else {
      if (tmax > t0) t0 = tmax;
      if (tmin < t1) t1 = tmin;
    }
  }
  {
    const tmin = (box.min.y - oy) * invY;
    const tmax = (box.max.y - oy) * invY;
    if (invY >= 0) {
      if (tmin > t0) t0 = tmin;
      if (tmax < t1) t1 = tmax;
    } else {
      if (tmax > t0) t0 = tmax;
      if (tmin < t1) t1 = tmin;
    }
  }
  {
    const tmin = (box.min.z - oz) * invZ;
    const tmax = (box.max.z - oz) * invZ;
    if (invZ >= 0) {
      if (tmin > t0) t0 = tmin;
      if (tmax < t1) t1 = tmax;
    } else {
      if (tmax > t0) t0 = tmax;
      if (tmin < t1) t1 = tmin;
    }
  }
  if (t1 < t0) return -1;
  return t0;
}

// ---------------------------------------------------------------------------
// Primitives
//
// Every primitive exposes:
//   bounds() -> AABB
//   hit(ro, rd, tMin, tMax, hit) -> boolean, fills the shared hit record
//   material -> material object
// ---------------------------------------------------------------------------

const EPS = 1e-8;

export function sphere(center, radius, material) {
  const r2 = radius * radius;
  const c = center;
  const bounds = {
    min: sub(c, v3(radius, radius, radius)),
    max: add(c, v3(radius, radius, radius)),
  };
  return {
    type: 'sphere',
    center: c,
    radius,
    material,
    bounds() {
      return bounds;
    },
    hit(ro, rd, tMin, tMax, hit) {
      const ocx = ro.x - c.x;
      const ocy = ro.y - c.y;
      const ocz = ro.z - c.z;
      const b = ocx * rd.x + ocy * rd.y + ocz * rd.z;
      const cval = ocx * ocx + ocy * ocy + ocz * ocz - r2;
      const disc = b * b - cval;
      if (disc < 0) return false;
      const sq = Math.sqrt(disc);
      let t = -b - sq;
      if (t < tMin || t > tMax) {
        t = -b + sq;
        if (t < tMin || t > tMax) return false;
      }
      hit.t = t;
      hit.p.x = ro.x + rd.x * t;
      hit.p.y = ro.y + rd.y * t;
      hit.p.z = ro.z + rd.z * t;
      const inv = 1 / radius;
      const nx = (hit.p.x - c.x) * inv;
      const ny = (hit.p.y - c.y) * inv;
      const nz = (hit.p.z - c.z) * inv;
      // geometric normal (outward) = normalized (p - c)
      hit.g.x = nx;
      hit.g.y = ny;
      hit.g.z = nz;
      const facing = -(nx * rd.x + ny * rd.y + nz * rd.z);
      const s = facing >= 0 ? 1 : -1;
      hit.n.x = nx * s;
      hit.n.y = ny * s;
      hit.n.z = nz * s;
      // spherical UV
      const u = 0.5 + Math.atan2(nz, nx) / (2 * Math.PI);
      const vv = 0.5 - Math.asin(clamp(ny, -1, 1)) / Math.PI;
      hit.uv[0] = u;
      hit.uv[1] = vv;
      hit.mat = material;
      hit.light = material.light || null;
      return true;
    },
  };
}

export function quad(origin, u, v, material) {
  const g = norm(cross(u, v));
  const area = len(cross(u, v));
  const o = origin;
  const min = minV(o, minV(add(o, u), minV(add(o, v), add(add(o, u), v))));
  const max = maxV(o, maxV(add(o, u), maxV(add(o, v), add(add(o, u), v))));
  const bounds = { min, max };
  return {
    type: 'quad',
    origin: o,
    u,
    v,
    normal: g,
    area,
    material,
    bounds() {
      return bounds;
    },
    hit(ro, rd, tMin, tMax, hit) {
      const denom = dot(rd, g);
      if (Math.abs(denom) < EPS) return false;
      const t = dot(sub(o, ro), g) / denom;
      if (t < tMin || t > tMax) return false;
      const px = ro.x + rd.x * t;
      const py = ro.y + rd.y * t;
      const pz = ro.z + rd.z * t;
      const d = { x: px - o.x, y: py - o.y, z: pz - o.z };
      const uu = dot(u, u);
      const vv = dot(v, v);
      const uvdot = dot(u, v);
      const du = dot(d, u);
      const dv = dot(d, v);
      const den = uu * vv - uvdot * uvdot;
      const a = (du * vv - dv * uvdot) / den;
      const b = (dv * uu - du * uvdot) / den;
      if (a < -1e-6 || a > 1 + 1e-6 || b < -1e-6 || b > 1 + 1e-6) return false;
      hit.t = t;
      hit.p.x = px;
      hit.p.y = py;
      hit.p.z = pz;
      hit.g.x = g.x;
      hit.g.y = g.y;
      hit.g.z = g.z;
      const facing = -denom; // denom = dot(rd, g); facing normal = -dot(rd,g)
      const s = facing >= 0 ? 1 : -1;
      hit.n.x = g.x * s;
      hit.n.y = g.y * s;
      hit.n.z = g.z * s;
      hit.uv[0] = clamp(a, 0, 1);
      hit.uv[1] = clamp(b, 0, 1);
      hit.mat = material;
      hit.light = material.light || null;
      return true;
    },
  };
}

// Single triangle with optional smooth (per-vertex) normals.
export function triangle(a, b, c, material, na, nb, nc) {
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const gn = norm(cross(e1, e2));
  const bounds = {
    min: minV(a, minV(b, c)),
    max: maxV(a, maxV(b, c)),
  };
  return {
    type: 'triangle',
    a,
    b,
    c,
    na,
    nb,
    nc,
    gn,
    material,
    bounds() {
      return bounds;
    },
    hit(ro, rd, tMin, tMax, hit) {
      // Möller–Trumbore
      const pvec = cross(rd, e2);
      const det = dot(e1, pvec);
      if (Math.abs(det) < EPS) return false;
      const invDet = 1 / det;
      const tvec = sub(ro, a);
      const u = dot(tvec, pvec) * invDet;
      if (u < 0 || u > 1) return false;
      const qvec = cross(tvec, e1);
      const v = dot(rd, qvec) * invDet;
      if (v < 0 || u + v > 1) return false;
      const t = dot(e2, qvec) * invDet;
      if (t < tMin || t > tMax) return false;

      hit.t = t;
      hit.p.x = ro.x + rd.x * t;
      hit.p.y = ro.y + rd.y * t;
      hit.p.z = ro.z + rd.z * t;
      hit.g.x = gn.x;
      hit.g.y = gn.y;
      hit.g.z = gn.z;

      if (na && nb && nc) {
        const w = 1 - u - v;
        let nx = w * na.x + u * nb.x + v * nc.x;
        let ny = w * na.y + u * nb.y + v * nc.y;
        let nz = w * na.z + u * nb.z + v * nc.z;
        const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz || 1);
        nx *= il;
        ny *= il;
        nz *= il;
        const facing = -(nx * rd.x + ny * rd.y + nz * rd.z);
        const s = facing >= 0 ? 1 : -1;
        hit.n.x = nx * s;
        hit.n.y = ny * s;
        hit.n.z = nz * s;
      } else {
        const facing = -det; // det = dot(e1, pvec) sign tracks orientation
        const s = facing >= 0 ? 1 : -1;
        hit.n.x = gn.x * s;
        hit.n.y = gn.y * s;
        hit.n.z = gn.z * s;
      }
      hit.uv[0] = u;
      hit.uv[1] = v;
      hit.mat = material;
      hit.light = material.light || null;
      return true;
    },
  };
}

// Axis-aligned box as 6 quads.
export function box(min, max, material) {
  const d = sub(max, min);
  const corners = [
    v3(min.x, min.y, min.z),
    v3(max.x, min.y, min.z),
    v3(max.x, max.y, min.z),
    v3(min.x, max.y, min.z),
    v3(min.x, min.y, max.z),
    v3(max.x, min.y, max.z),
    v3(max.x, max.y, max.z),
    v3(min.x, max.y, max.z),
  ];
  const X = v3(d.x, 0, 0);
  const Y = v3(0, d.y, 0);
  const Z = v3(0, 0, d.z);
  return [
    quad(corners[0], X, Y, material), // -z
    quad(corners[4], X, Y, material), // +z
    quad(corners[0], Z, Y, material), // -x
    quad(corners[1], Z, Y, material), // +x
    quad(corners[0], X, Z, material), // -y
    quad(corners[3], X, Z, material), // +y
  ];
}

// ---------------------------------------------------------------------------
// Mesh generators (return flat arrays of triangle primitives)
// ---------------------------------------------------------------------------

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

// (p,q)-torus knot as a tube with a Frenet frame. Smooth normals.
export function torusKnotMesh({ p = 2, q = 3, R = 1.0, r = 0.35, tube = 0.12, nt = 256, nphi = 48, material, offset = v3(0, 0, 0) }) {
  const curve = (t) => {
    const a = R + r * Math.cos(q * t);
    return {
      x: a * Math.cos(p * t),
      y: a * Math.sin(p * t),
      z: r * Math.sin(q * t),
    };
  };
  const vertices = [];
  const normals = [];
  const dt = (2 * Math.PI) / nt;
  const h = 1e-4;

  // Precompute center + frame for each ring.
  const frames = [];
  for (let i = 0; i < nt; i++) {
    const t = i * dt;
    const c = curve(t);
    // central-difference derivatives
    const c1 = curve(t - h);
    const c2 = curve(t + h);
    const d1 = { x: (c2.x - c1.x) / (2 * h), y: (c2.y - c1.y) / (2 * h), z: (c2.z - c1.z) / (2 * h) };
    const T = norm(d1);
    const dd = { x: (c2.x - 2 * c.x + c1.x) / (h * h), y: (c2.y - 2 * c.y + c1.y) / (h * h), z: (c2.z - 2 * c.z + c1.z) / (h * h) };
    const td = dot(dd, T);
    let N = norm({ x: dd.x - td * T.x, y: dd.y - td * T.y, z: dd.z - td * T.z });
    // Guard against degenerate curvature
    if (len2(N) < 1e-12) {
      N = { x: Math.cos(t), y: Math.sin(t), z: 0 };
    }
    const B = cross(T, N);
    frames.push({ c, N, B });
  }

  for (let i = 0; i < nt; i++) {
    const f = frames[i];
    for (let j = 0; j < nphi; j++) {
      const phi = (j / nphi) * 2 * Math.PI;
      const co = Math.cos(phi);
      const si = Math.sin(phi);
      const pv = {
        x: offset.x + f.c.x + tube * (f.N.x * co + f.B.x * si),
        y: offset.y + f.c.y + tube * (f.N.y * co + f.B.y * si),
        z: offset.z + f.c.z + tube * (f.N.z * co + f.B.z * si),
      };
      const nv = { x: f.N.x * co + f.B.x * si, y: f.N.y * co + f.B.y * si, z: f.N.z * co + f.B.z * si };
      vertices.push(pv);
      normals.push(nv);
    }
  }

  const idx = (i, j) => i * nphi + (j % nphi);
  const tris = [];
  for (let i = 0; i < nt; i++) {
    const i2 = (i + 1) % nt;
    for (let j = 0; j < nphi; j++) {
      const a = idx(i, j);
      const b = idx(i2, j);
      const c = idx(i2, j + 1);
      const d = idx(i, j + 1);
      tris.push(triangle(vertices[a], vertices[b], vertices[c], material, normals[a], normals[b], normals[c]));
      tris.push(triangle(vertices[a], vertices[c], vertices[d], material, normals[a], normals[c], normals[d]));
    }
  }
  return tris;
}

// Icosphere with optional noise displacement (for organic rocks/planets).
export function icosphereMesh({ radius = 1, subdiv = 2, material, displace = null }) {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [
    v3(-1, t, 0), v3(1, t, 0), v3(-1, -t, 0), v3(1, -t, 0),
    v3(0, -1, t), v3(0, 1, t), v3(0, -1, -t), v3(0, 1, -t),
    v3(t, 0, -1), v3(t, 0, 1), v3(-t, 0, -1), v3(-t, 0, 1),
  ].map((p) => norm(p));
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  const midCache = new Map();
  const midpoint = (a, b) => {
    const key = a < b ? a + '_' + b : b + '_' + a;
    if (midCache.has(key)) return midCache.get(key);
    const m = norm(lerpV(verts[a], verts[b], 0.5));
    const id = verts.length;
    verts.push(m);
    midCache.set(key, id);
    return id;
  };
  const lerpV = (a, b, s) => ({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, z: a.z + (b.z - a.z) * s });

  let fs = faces;
  for (let i = 0; i < subdiv; i++) {
    const next = [];
    for (const [a, b, c] of fs) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    fs = next;
  }

  const tris = [];
  for (const [a, b, c] of fs) {
    const va = verts[a];
    const vb = verts[b];
    const vc = verts[c];
    let pa = mul(va, radius);
    let pb = mul(vb, radius);
    let pc = mul(vc, radius);
    if (displace) {
      pa = mul(va, radius + displace(va));
      pb = mul(vb, radius + displace(vb));
      pc = mul(vc, radius + displace(vc));
    }
    // Recompute smooth normals for displaced vertices via face-free averaging is
    // expensive; approximate with the analytic normal (good for mild displacement).
    let na = va;
    let nb = vb;
    let nc = vc;
    if (displace) {
      na = norm(pa);
      nb = norm(pb);
      nc = norm(pc);
    }
    tris.push(triangle(pa, pb, pc, material, na, nb, nc));
  }
  return tris;
}

// ---------------------------------------------------------------------------
// BVH
// ---------------------------------------------------------------------------

const LEAF = 8;

export function buildBVH(prims) {
  // Build over primitive *indices* to avoid copying.
  const order = prims.map((_, i) => i);

  const nodeCount = () => 0;
  const nodes = []; // {min,max,left,right,count} ; leaves: count>0, first=left

  const centroid = (i) => {
    const b = prims[i].bounds();
    return {
      x: (b.min.x + b.max.x) * 0.5,
      y: (b.min.y + b.max.y) * 0.5,
      z: (b.min.z + b.max.z) * 0.5,
    };
  };

  const build = (lo, hi) => {
    const n = hi - lo;
    const box = emptyBox();
    for (let i = lo; i < hi; i++) {
      const b = prims[order[i]].bounds();
      box.min = minV(box.min, b.min);
      box.max = maxV(box.max, b.max);
    }
    if (n <= LEAF) {
      nodes.push({ min: box.min, max: box.max, left: lo, count: n });
      return nodes.length - 1;
    }
    // Choose largest axis, median split on centroids.
    const ext = { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z };
    let axis = 0;
    if (ext.y > ext.x) axis = 1;
    if (ext.z > ext[axis === 0 ? 'x' : 'y']) axis = 2;

    const sub = order.slice(lo, hi);
    sub.sort((a, b) => {
      const ca = centroid(a);
      const cb = centroid(b);
      return (axis === 0 ? ca.x - cb.x : axis === 1 ? ca.y - cb.y : ca.z - cb.z);
    });
    for (let i = 0; i < n; i++) order[lo + i] = sub[i];

    const mid = lo + (n >> 1);
    const li = build(lo, mid);
    const ri = build(mid, hi);
    nodes.push({ min: box.min, max: box.max, left: li, right: ri, count: 0 });
    return nodes.length - 1;
  };

  const root = build(0, prims.length);

  function intersect(o, d, tMin, tMax, hit) {
    const invX = 1 / d.x;
    const invY = 1 / d.y;
    const invZ = 1 / d.z;
    const stack = [root];
    let found = false;
    let tHit = tMax;
    while (stack.length) {
      const id = stack.pop();
      const node = nodes[id];
      if (node.count === 0) {
        const l = nodes[node.left];
        const r = nodes[node.right];
        const tl = boxHit(l, o.x, o.y, o.z, invX, invY, invZ, tMin, tHit);
        const tr = boxHit(r, o.x, o.y, o.z, invX, invY, invZ, tMin, tHit);
        if (tl >= 0 && tr >= 0) {
          // Push farther child first so the nearer one is traversed first.
          if (tl < tr) {
            stack.push(node.right);
            stack.push(node.left);
          } else {
            stack.push(node.left);
            stack.push(node.right);
          }
        } else if (tl >= 0) {
          stack.push(node.left);
        } else if (tr >= 0) {
          stack.push(node.right);
        }
      } else {
        for (let i = node.left; i < node.left + node.count; i++) {
          if (prims[order[i]].hit(o, d, tMin, tHit, hit)) {
            if (hit.t < tHit) {
              tHit = hit.t;
              found = true;
            }
          }
        }
      }
    }
    return found;
  }

  return {
    intersect,
    nodes,
    root,
    primitiveCount: prims.length,
  };
}
