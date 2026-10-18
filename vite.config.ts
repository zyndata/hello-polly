import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  build: {
    // Vite's module-preload polyfill is injected as an inline <script>, which the production
    // CSP (no 'unsafe-inline') blocks. Every browser we target supports
    // <link rel="modulepreload"> natively.
    modulePreload: { polyfill: false },
    // Fonts and images are always files, never data: URIs. A data: font would need
    // `font-src data:`, and the CSP stays at 'self'.
    assetsInlineLimit: 0,
    target: 'es2022'
  },
  server: {
    port: 5173
  }
});
