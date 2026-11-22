// Fast, high-quality deterministic PRNG for path tracing.
// mulberry32 (Tommy Ettinger) — small state, good equidistribution, and a
// uniform [0,1) output. Seeded per pixel/sample so renders are reproducible.

export function rng(seed = 0x9e3779b9) {
  let a = seed >>> 0;

  function nextU32() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }

  function next() {
    return nextU32() / 4294967296;
  }

  // Derive an independent stream (used for sub-tasks).
  function fork(salt = 0) {
    return rng((nextU32() ^ (salt >>> 0)) >>> 0);
  }

  return { next, uniform: next, fork };
}

// SplitMix64-based hashing for stable per-pixel seeds.
export function hashSeed(x, y, salt = 0) {
  let h =
    (BigInt(x) * 0x9e3779b97f4a7c15n +
      BigInt(y) * 0xbf58476d1ce4e5b9n +
      BigInt(salt) * 0x94d049bb133111ebn) &
    0xffffffffffffffffn;
  h ^= h >> 30n;
  h = (h * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
  h ^= h >> 27n;
  h = (h * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
  h ^= h >> 31n;
  return Number(h & 0xffffffffn) >>> 0;
}
