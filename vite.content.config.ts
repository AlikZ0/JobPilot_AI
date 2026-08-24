import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * The content script must be a single classic script (no ESM imports) because
 * it is injected with chrome.scripting.executeScript({ files: [...] }).
 */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome114',
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'JobPilotContent',
      fileName: () => 'content/index.js',
    },
    rollupOptions: {
      output: { extend: true, inlineDynamicImports: true },
    },
  },
});
