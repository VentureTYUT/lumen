// Parallel tiled renderer using worker_threads. Each worker renders a
// horizontal band to completion and returns linear HDR floats (transferable).
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

function runWorker({ scenePath, width, height, spp, y0, y1, seed }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), {
      workerData: { scenePath, width, height, spp, y0, y1, seed },
    });
    worker.once('message', (msg) => {
      if (msg.error) {
        reject(new Error(msg.error));
        return;
      }
      resolve({ y0, buffer: msg.buffer });
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`worker exited with code ${code}`));
    });
  });
}

export async function render({ scenePath, width, height, spp, threads = os.cpus().length, seed = 1 }) {
  const sceneUrl = scenePath.startsWith('file:') ? scenePath : pathToFileURL(scenePath).href;
  const n = Math.min(Math.max(1, threads), height);
  const rowsPer = Math.floor(height / n);
  const bands = [];
  let y = 0;
  for (let i = 0; i < n; i++) {
    const y0 = y;
    const y1 = i === n - 1 ? height : y + rowsPer;
    bands.push({ y0, y1 });
    y = y1;
  }

  const t0 = Date.now();
  const results = await Promise.all(
    bands.map((b) =>
      runWorker({ scenePath: sceneUrl, width, height, spp, y0: b.y0, y1: b.y1, seed })
    )
  );
  const elapsed = (Date.now() - t0) / 1000;

  const image = new Float32Array(width * height * 3);
  for (const r of results) {
    image.set(new Float32Array(r.buffer), r.y0 * width * 3);
  }
  const mrays = (width * height * spp) / 1e6;
  return { image, stats: { width, height, spp, threads: n, seconds: elapsed, mrays, mraysPerSec: mrays / elapsed } };
}
