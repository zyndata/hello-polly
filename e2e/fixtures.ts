import { expect, test as base } from '@playwright/test';

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

/**
 * Every page records Content-Security-Policy violations from the first byte, and every test
 * fails if any were reported. Under `vite preview` there is no policy, so this only bites in
 * the container run (`npm run test:e2e:csp`), which is exactly where it has to.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    await use(page);
    const violations = await page.evaluate(() => window.__cspViolations ?? []);
    expect(violations, 'CSP violations').toEqual([]);
  }
});

export { expect };
