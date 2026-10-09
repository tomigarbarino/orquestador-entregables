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
  // Las dependencias grandes van en archivos aparte (ninguno supera el límite de 500 kB).
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-flow': ['@xyflow/react'],
          iconos: ['lucide-react'],
          markdown: ['react-markdown'],
          validacion: ['ajv', 'ajv-i18n/localize/es/index.js'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['ajv', 'ajv-i18n/localize/es/index.js', 'react-markdown', '@xyflow/react', 'react', 'react-dom/client', 'lucide-react'],
  },
});
