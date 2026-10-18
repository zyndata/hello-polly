import { expect, test } from './fixtures';
import topics from '../content/topics.json' with { type: 'json' };
import words from '../content/words.json' with { type: 'json' };
import { imageSources } from '../src/lib/images';

declare const process: { env: Record<string, string | undefined> };

const ids = [...new Set([...words.map((w) => w.image), ...topics.map((t) => t.icon)])];

/** Loads each URL as an <img> in the page and returns the ones that did not decode. */
async function failedImages(page: import('@playwright/test').Page, urls: string[]): Promise<string[]> {
  return page.evaluate(
    (list) =>
      Promise.all(
        list.map(
          (src) =>
            new Promise<string | null>((resolve) => {
              const img = new Image();
              img.onload = () => resolve(img.naturalWidth > 0 ? null : src);
              img.onerror = () => resolve(src);
              img.src = src;
            })
        )
      ).then((results) => results.filter((r): r is string => r !== null)),
    urls
  );
}

test('every content picture loads from the origin (dev, preview and docker builds)', async ({ page }) => {
  await page.goto('/');
  const urls = ids.map((id) => imageSources(id, undefined)[0] as string);
  expect(urls.length).toBeGreaterThan(40);
  expect(await failedImages(page, urls)).toEqual([]);
});

test('the origin serves pictures as SVG', async ({ request }) => {
  const response = await request.get('/content/img/banana.svg');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
});

/**
 * Opt-in, because it needs the network and a pushed ref: `E2E_CDN_REF=dev` (or a tag) loads
 * the pictures from jsDelivr at that ref. Run under `test:e2e:csp` it proves the CSP admits
 * them; that is how STATE.md decision 13 was verified.
 */
test('pictures load from jsDelivr at a ref, within the CSP', async ({ page }) => {
  const ref = process.env.E2E_CDN_REF;
  test.skip(!ref, 'set E2E_CDN_REF to a pushed branch or tag');
  await page.goto('/');
  const urls = ids.map((id) => imageSources(id, ref)[0] as string);
  expect(urls[0]).toContain(`https://cdn.jsdelivr.net/gh/zyndata/hello-polly@${ref}/content/img/`);
  expect(await failedImages(page, urls)).toEqual([]);
});
