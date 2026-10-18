import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageBase, imageSources, imageUrls } from './images';

describe('ImageSource', () => {
  it('without a release ref (dev, preview, CI): the origin only', () => {
    expect(imageSources('banana', undefined)).toEqual(['/content/img/banana.svg']);
    expect(imageBase(undefined, '/app')).toBe('/app/content/img/');
  });

  it('in a tagged production build: jsDelivr at that tag first, the origin as the fallback', () => {
    expect(imageSources('keycap-3', 'v0.2.0')).toEqual([
      'https://cdn.jsdelivr.net/gh/zyndata/hello-polly@v0.2.0/content/img/keycap-3.svg',
      '/content/img/keycap-3.svg'
    ]);
  });

  it('an id is a path segment, never a path', () => {
    expect(imageSources('../x', undefined)).toEqual(['/content/img/..%2Fx.svg']);
  });

  describe('imageUrls follows the build', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('VITE_CONTENT_REF unset: origin', () => {
      vi.stubEnv('VITE_CONTENT_REF', '');
      expect(imageUrls('pear')).toEqual(['/content/img/pear.svg']);
    });

    it('VITE_CONTENT_REF set by deploy.yml: jsDelivr at that tag, then origin', () => {
      vi.stubEnv('VITE_CONTENT_REF', 'v1.2.3');
      expect(imageUrls('pear')).toEqual([
        'https://cdn.jsdelivr.net/gh/zyndata/hello-polly@v1.2.3/content/img/pear.svg',
        '/content/img/pear.svg'
      ]);
    });
  });
});
