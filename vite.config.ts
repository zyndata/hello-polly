import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Serves `content/img/` at `/content/img/` in dev and copies it into `dist/content/img/` on
 * build (so `preview`, Docker and the jsDelivr fallback have it). It stays at the repository
 * root, not under `public/`, because jsDelivr serves the same path from the release tag
 * (STATE.md decision 11).
 */
function contentImages(): Plugin {
  const dir = fileURLToPath(new URL('./content/img', import.meta.url));
  return {
    name: 'hello-polly:content-images',
    configureServer(server) {
      server.middlewares.use('/content/img', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '').split('?')[0] ?? '').replace(/^\//, '');
        if (!/^[a-z0-9-]+\.svg$/.test(name)) return next();
        try {
          const body = readFileSync(join(dir, name));
          res.setHeader('Content-Type', 'image/svg+xml');
          res.end(body);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const name of readdirSync(dir)) {
        this.emitFile({ type: 'asset', fileName: `content/img/${name}`, source: readFileSync(join(dir, name)) });
      }
    }
  };
}

export default defineConfig({
  plugins: [svelte(), tailwindcss(), contentImages()],
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
