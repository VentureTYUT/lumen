// Command-line renderer.
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { render } from './render.js';
import { tonemap } from './tonemap.js';
import { encodePNG } from './png.js';

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
function has(flag) {
  return process.argv.includes(flag);
}

export async function main() {
  if (has('--help') || has('-h')) {
    console.log(`lumen — physically-based path tracer
Usage: node src/cli.js --scene <file> --out <file.png> [options]
  --scene <file>   scene module (exports buildScene)
  --out <file>     output PNG path
  --width N        image width            (default 800)
  --height N       image height           (default 600)
  --spp N          samples per pixel      (default 256)
  --threads N      worker threads         (default: CPU count)
  --seed N         random seed            (default 1)
  --exposure F     tonemap exposure       (default 1)
`);
    return;
  }

  const scene = arg('--scene');
  const out = arg('--out');
  if (!scene || !out) {
    console.error('error: --scene and --out are required (see --help)');
    process.exit(1);
  }

  const width = parseInt(arg('--width', '800'), 10);
  const height = parseInt(arg('--height', '600'), 10);
  const spp = parseInt(arg('--spp', '256'), 10);
  const threads = parseInt(arg('--threads', '0'), 10) || undefined;
  const seed = parseInt(arg('--seed', '1'), 10) || 1;
  const exposure = parseFloat(arg('--exposure', '1'));

  console.log(`lumen: ${scene} -> ${out}`);
  console.log(`  ${width}x${height} @ ${spp} spp, ${threads ?? 'auto'} threads`);

  const { image, stats } = await render({
    scenePath: resolve(scene),
    width,
    height,
    spp,
    threads,
    seed,
  });

  const rgb8 = tonemap(image, width, height, { exposure });
  const png = encodePNG(width, height, rgb8);
  mkdirSync(resolve(out, '..'), { recursive: true });
  writeFileSync(resolve(out), png);

  console.log(`  done in ${stats.seconds.toFixed(2)}s (${stats.mrays.toFixed(1)}M primary rays, ${stats.mraysPerSec.toFixed(2)}M rays/s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
