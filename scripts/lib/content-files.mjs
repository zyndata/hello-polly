/**
 * Where the content lives on disk, and how the Node scripts read it. Every path is built with
 * `node:path` from this file's location, so the scripts behave the same on Windows and Linux.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @param {string} root */
export const contentDir = (root) => join(root, 'content');
/** @param {string} root */
export const imageDir = (root) => join(root, 'content', 'img');

/** Files in content/img/ that are not pictures. */
export const IMAGE_DIR_EXTRAS = ['LICENSE', 'ATTRIBUTION.md'];

/**
 * @param {string} file
 * @returns {any}
 */
export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * Every content file the app bundles. A list file that does not exist yet counts as empty.
 * @param {string} root
 * @returns {import('./content-rules.mjs').ContentSet}
 */
export function loadContent(root) {
  /** @param {string} name */
  const list = (name) => {
    const file = join(contentDir(root), `${name}.json`);
    return existsSync(file) ? readJson(file) : [];
  };
  return {
    topics: list('topics'),
    words: list('words'),
    prompts: list('prompts'),
    praise: list('praise'),
    stories: list('stories'),
    stickers: list('stickers'),
    avatars: list('avatars')
  };
}

/**
 * Image id → byte size, for every `.svg` in content/img/.
 * @param {string} root
 * @returns {Map<string, number>}
 */
export function readImageBytes(root) {
  const dir = imageDir(root);
  /** @type {Map<string, number>} */
  const sizes = new Map();
  if (!existsSync(dir)) return sizes;
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.svg')) sizes.set(name.slice(0, -'.svg'.length), statSync(join(dir, name)).size);
  }
  return sizes;
}
