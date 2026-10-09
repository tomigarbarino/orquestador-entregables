#!/usr/bin/env node
// Compila la demo pública estática (sin servidor) en dist-demo/. Para Vercel o cualquier hosting estático.
//   npm run build:demo
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.VITE_DEMO_ESTATICA = '1';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { build } = await import('vite');
await build({
  configFile: path.join(raiz, 'web', 'vite.config.mjs'),
  build: { outDir: path.join(raiz, 'dist-demo'), emptyOutDir: true },
});
console.log('\nDemo estática lista en dist-demo/');
