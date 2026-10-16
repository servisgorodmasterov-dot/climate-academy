import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: true, proxy: { '/api': 'http://localhost:8080' } },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: { output: { manualChunks: { three: ['three'], r3f: ['@react-three/fiber', '@react-three/drei'] } } },
  },
  test: { environment: 'jsdom', setupFiles: ['src/test-setup.ts'] },
} as any);
