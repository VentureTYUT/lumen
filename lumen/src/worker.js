// Render worker: builds the scene, renders one band, returns HDR floats.
import { parentPort, workerData } from 'node:worker_threads';
import { makeIntegrator } from './integrator.js';
import { hashSeed, rng } from './rng.js';

const { scenePath, width, height, spp, y0, y1, seed } = workerData;

try {
  const mod = await import(scenePath);
  const scene = typeof mod.buildScene === 'function' ? mod.buildScene({ width, height }) : mod.default;
  const { Li } = makeIntegrator(scene);

  const bandH = y1 - y0;
  const out = new Float32Array(width * bandH * 3);
  const invSpp = 1 / spp;

  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      let R = 0;
      let G = 0;
      let B = 0;
      for (let s = 0; s < spp; s++) {
        const r = rng(hashSeed(x, y, seed + s));
        const u = (x + r.next()) / width;
        const v = (y + r.next()) / height;
        const ray = scene.camera.generateRay(u, v, r);
        const c = Li(ray.o, ray.d, r);
        R += c.x;
        G += c.y;
        B += c.z;
      }
      const o = ((y - y0) * width + x) * 3;
      out[o] = R * invSpp;
      out[o + 1] = G * invSpp;
      out[o + 2] = B * invSpp;
    }
  }

  const buffer = out.buffer;
  parentPort.postMessage({ buffer }, [buffer]);
} catch (err) {
  parentPort.postMessage({ error: err && err.stack ? err.stack : String(err) });
}
