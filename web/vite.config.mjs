import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
  root: path.join(raiz, 'web'),
  plugins: [react()],
  resolve: { alias: { '@lib': path.join(raiz, 'lib') } },
  server: { fs: { allow: [raiz] } },
  optimizeDeps: {
    include: ['ajv', 'ajv-i18n/localize/es/index.js', 'react-markdown', '@xyflow/react', 'react', 'react-dom/client'],
  },
});
