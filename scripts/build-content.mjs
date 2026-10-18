#!/usr/bin/env node
/**
 * Build the picture set: copy the curated Fluent Emoji subset (content/images.json) from its
 * pinned upstream commit into content/img/, run SVGO, enforce the size budget, and write the
 * licence and attribution next to the files.
 *
 *   npm run content                          # downloads (needs the network); commit the result
 *   node scripts/build-content.mjs --check   # offline; what CI runs (inside check:content)
 *
 * --check downloads nothing. It verifies that content/img/ is exactly what the manifest says:
 * every id has its file, there are no strays, every file is within budget, and LICENSE and
 * ATTRIBUTION.md exist and name the pinned commit.
 *
 * Options: --root <dir> runs against another checkout (the unit tests use a fixture).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { IMAGE_DIR_EXTRAS, REPO_ROOT, contentDir, imageDir, readImageBytes, readJson } from './lib/content-files.mjs';
import { SVG_BUDGET_BYTES } from './lib/content-rules.mjs';

const { values: args } = parseArgs({
  options: { check: { type: 'boolean', default: false }, root: { type: 'string' } }
});
const root = args.root ? resolve(args.root) : REPO_ROOT;

const manifest = readJson(join(contentDir(root), 'images.json'));
/** @type {Record<string, string | { path: string, floatPrecision: number }>} */
const images = manifest.images;
/** @type {string} */
const commit = manifest.source.commit;
const outDir = imageDir(root);

const kB = (/** @type {number} */ n) => `${(n / 1024).toFixed(1)} kB`;

if (args.check) {
  process.exit(check() ? 0 : 1);
} else {
  await build();
}

/** @returns {boolean} true when content/img/ matches the manifest */
function check() {
  /** @type {string[]} */
  const errors = [];
  const sizes = readImageBytes(root);

  for (const id of Object.keys(images)) {
    const bytes = sizes.get(id);
    if (bytes === undefined) errors.push(`${id}.svg is missing (run \`npm run content\`)`);
    else if (bytes > SVG_BUDGET_BYTES) errors.push(`${id}.svg is ${kB(bytes)}, over the ${kB(SVG_BUDGET_BYTES)} budget`);
  }
  const files = existsSync(outDir) ? readdirSync(outDir) : [];
  for (const name of files) {
    const known = IMAGE_DIR_EXTRAS.includes(name) || (name.endsWith('.svg') && name.slice(0, -4) in images);
    if (!known) errors.push(`${name} is not in content/images.json (a stray file)`);
  }
  for (const name of IMAGE_DIR_EXTRAS) {
    if (!files.includes(name)) errors.push(`${name} is missing (run \`npm run content\`)`);
  }
  if (files.includes('ATTRIBUTION.md') && !readFileSync(join(outDir, 'ATTRIBUTION.md'), 'utf8').includes(commit)) {
    errors.push(`ATTRIBUTION.md does not name the pinned commit ${commit} (run \`npm run content\`)`);
  }

  for (const error of errors) console.error(`✗ ${error}`);
  if (errors.length === 0) {
    const total = [...sizes.values()].reduce((a, b) => a + b, 0);
    console.log(`✓ content/img: ${sizes.size} pictures, ${kB(total)}, all within ${kB(SVG_BUDGET_BYTES)}, pinned to ${commit.slice(0, 12)}`);
  }
  return errors.length === 0;
}

async function build() {
  const { optimize } = await import('svgo');
  const raw = (/** @type {string} */ path) =>
    `https://raw.githubusercontent.com/microsoft/fluentui-emoji/${commit}/${path.split('/').map(encodeURIComponent).join('/')}`;

  /** @param {string} path */
  const download = async (path) => {
    const response = await fetch(raw(path));
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.text();
  };

  mkdirSync(outDir, { recursive: true });
  /** @type {{ id: string, path: string, before: number, after: number }[]} */
  const rows = [];
  for (const [id, entry] of Object.entries(images)) {
    const { path, floatPrecision = 3 } = typeof entry === 'string' ? { path: entry } : entry;
    const source = await download(path);
    const { data } = optimize(source, {
      multipass: true,
      floatPrecision,
      plugins: [{ name: 'preset-default', params: { floatPrecision } }]
    });
    writeFileSync(join(outDir, `${id}.svg`), data);
    rows.push({ id, path, before: Buffer.byteLength(source), after: Buffer.byteLength(data) });
  }

  // Strays: anything no longer in the manifest goes.
  for (const name of readdirSync(outDir)) {
    if (IMAGE_DIR_EXTRAS.includes(name)) continue;
    if (!(name.endsWith('.svg') && name.slice(0, -4) in images)) {
      rmSync(join(outDir, name));
      console.log(`removed ${name}`);
    }
  }

  writeFileSync(join(outDir, 'LICENSE'), (await download('LICENSE')).replace(/\r\n/g, '\n'));
  writeFileSync(join(outDir, 'ATTRIBUTION.md'), attribution(rows));

  rows.sort((a, b) => b.after - a.after);
  const over = rows.filter((r) => r.after > SVG_BUDGET_BYTES);
  for (const r of rows.slice(0, 8)) console.log(`${kB(r.after).padStart(8)}  ${r.id}  (from ${kB(r.before)})`);
  const total = rows.reduce((a, r) => a + r.after, 0);
  console.log(`${rows.length} pictures, ${kB(total)} in total`);
  for (const r of over) console.error(`✗ ${r.id}.svg is ${kB(r.after)}, over the ${kB(SVG_BUDGET_BYTES)} budget`);
  if (over.length > 0) process.exit(1);
}

/** @param {{ id: string, path: string }[]} rows */
function attribution(rows) {
  const lines = [...rows]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => `| \`${r.id}.svg\` | \`${r.path}\` |`);
  return `# Picture attribution

The pictures in this directory are from **${manifest.source.name}**
(${manifest.source.repository}), © Microsoft Corporation, under the MIT licence (\`LICENSE\`
next to this file). They were copied from commit \`${commit}\` and optimised with SVGO; the
shapes and colours are unchanged.

Generated by \`scripts/build-content.mjs\` from \`content/images.json\`. Do not edit by hand.

| File | Upstream path |
|---|---|
${lines.join('\n')}
`;
}
