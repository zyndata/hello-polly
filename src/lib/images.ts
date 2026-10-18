/**
 * ImageSource (PLAN.md "Speech and pictures are replaceable"): the one module that turns an
 * image id into a URL. Content and screens only ever hold ids, so replacing the picture set
 * (another emoji set, custom illustrations) changes this file and `content/`, nothing else.
 *
 * A production build made from a release tag (`VITE_CONTENT_REF`, set by deploy.yml) loads
 * from jsDelivr at that tag: immutable, cached forever, no transfer from the owner's server.
 * Every other build (dev, preview, `docker:up`, CI) loads from the origin, which serves the
 * same files at `/content/img/` (vite.config.ts). If jsDelivr fails, the origin is the
 * fallback.
 */

import type { ImageId } from './types';

export const CDN_REPOSITORY = 'zyndata/hello-polly';
export const IMAGE_PATH = 'content/img';

/** Where pictures load from first: jsDelivr at a git ref, or the origin when there is none. */
export function imageBase(ref: string | undefined, originBase = '/'): string {
  const origin = `${originBase.replace(/\/?$/, '/')}${IMAGE_PATH}/`;
  return ref ? `https://cdn.jsdelivr.net/gh/${CDN_REPOSITORY}@${ref}/${IMAGE_PATH}/` : origin;
}

/** The URLs to try for an image, in order. Equal URLs are listed once. */
export function imageSources(id: ImageId, ref: string | undefined, originBase = '/'): string[] {
  const file = `${encodeURIComponent(id)}.svg`;
  const primary = imageBase(ref, originBase) + file;
  const fallback = imageBase(undefined, originBase) + file;
  return primary === fallback ? [primary] : [primary, fallback];
}

/**
 * The URLs for this build: CDN first in a tagged production build, origin otherwise. Reads
 * `import.meta.env` here rather than at module load, so the pure functions above can be
 * imported outside Vite (the e2e specs do).
 */
export function imageUrls(id: ImageId): string[] {
  return imageSources(id, import.meta.env.VITE_CONTENT_REF || undefined, import.meta.env.BASE_URL);
}
