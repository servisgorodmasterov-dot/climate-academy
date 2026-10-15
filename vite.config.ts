import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 — сборка в один HTML-файл (для публикации/офлайн-демо).
const single = process.env.SINGLE === '1';

export default defineConfig({
  plugins: [react(), ...(single ? [viteSingleFile()] : [])],
  base: './',
  build: {
    target: 'es2019',
    chunkSizeWarningLimit: 3000,
    outDir: single ? 'dist-single' : 'dist',
    // Постоянные имена файлов: при обновлении сайта они перезаписываются,
    // а не копятся в папке docs/ новыми версиями с хешами.
    rollupOptions: single
      ? undefined
      : {
          output: {
            entryFileNames: 'assets/[name].js',
            chunkFileNames: 'assets/[name].js',
            assetFileNames: 'assets/[name][extname]',
          },
        },
  },
});
