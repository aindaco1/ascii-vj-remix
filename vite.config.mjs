import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port: 8010,
    strictPort: false,
    fs: {
      strict: true
    }
  },
  preview: {
    host: '127.0.0.1',
    port: 8010,
    strictPort: false
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    assetsDir: 'assets/build',
    rollupOptions: {
      input: {
        main: 'index.html',
        output: 'output.html'
      }
    }
  }
});
