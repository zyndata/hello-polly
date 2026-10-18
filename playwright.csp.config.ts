import { defineConfig } from '@playwright/test';
import { shared } from './playwright.config';

/**
 * The same specs against the Caddy container, under the production headers. Start it first
 * with `npm run docker:up`; this config starts no server of its own.
 *
 * `localhost`, not `127.0.0.1`: from Phase 7 only the former is an authorized OAuth origin.
 */
export default defineConfig({
  ...shared,
  use: { baseURL: 'http://localhost:8081', trace: 'retain-on-failure' }
});
