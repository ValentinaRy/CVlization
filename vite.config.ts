import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rolldownOptions: {
      input: {
        dashboard: fileURLToPath(new URL('./dashboard.html', import.meta.url)),
        resume: fileURLToPath(new URL('./resume.html', import.meta.url)),
        popup: fileURLToPath(new URL('./popup.html', import.meta.url)),
        debug: fileURLToPath(new URL('./debug.html', import.meta.url)),
      },
    },
  },
});
