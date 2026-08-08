import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const common = {
  bundle: true,
  target: 'chrome116',
  sourcemap: true,
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
};

await Promise.all([
  build({ ...common, entryPoints: [resolve(root, 'src/background/serviceWorker.ts')], outfile: resolve(dist, 'background.js'), format: 'esm' }),
  build({ ...common, entryPoints: [resolve(root, 'src/content/contentScript.ts')], outfile: resolve(dist, 'content.js'), format: 'iife' }),
  build({ ...common, entryPoints: [resolve(root, 'src/sidepanel/main.tsx')], outfile: resolve(dist, 'sidepanel.js'), format: 'esm' }),
]);

await cp(resolve(root, 'public'), dist, { recursive: true });
