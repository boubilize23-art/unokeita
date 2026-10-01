import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const WS_PORT = process.env.VITE_WS_PORT || 3001;

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT || 5173),
    host: true,
    proxy: {
      '/api': {
        target: `http://localhost:${WS_PORT}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});