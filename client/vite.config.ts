import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    host: true,
    // Same-origin API in dev, so the httpOnly refresh cookie works without CORS tricks.
    proxy: { '/api': { target: process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:5000', changeOrigin: false } },
  },
  build: { sourcemap: false },
});
