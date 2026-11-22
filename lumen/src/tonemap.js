// HDR (linear float) -> LDR 8-bit RGB via ACES filmic tonemap + gamma.

function aces(x) {
  // Hill ACES approximation, fitted for [0, ~30].
  return (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
}

function sanitize(x) {
  return Number.isFinite(x) ? x : 0;
}

export function tonemap(hdr, width, height, { exposure = 1, gamma = 1 / 2.2 } = {}) {
  const out = new Uint8Array(width * height * 3);
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const r = Math.pow(Math.max(aces(sanitize(hdr[i * 3]) * exposure), 0), gamma);
    const g = Math.pow(Math.max(aces(sanitize(hdr[i * 3 + 1]) * exposure), 0), gamma);
    const b = Math.pow(Math.max(aces(sanitize(hdr[i * 3 + 2]) * exposure), 0), gamma);
    out[i * 3] = Math.min(255, Math.round(r * 255));
    out[i * 3 + 1] = Math.min(255, Math.round(g * 255));
    out[i * 3 + 2] = Math.min(255, Math.round(b * 255));
  }
  return out;
}
