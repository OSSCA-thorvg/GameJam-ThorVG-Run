import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  assetsInclude: ['**/*.wasm'],
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
