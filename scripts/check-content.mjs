#!/usr/bin/env node
/**
 * The content validator (PLAN.md "Content model"): unique ids, every word has a picture within
 * budget and a `pl`, every topic word exists, every story token is vocabulary or an allowed
 * function word, the Polish prompt catalog is complete, every sticker has a picture.
 *
 *   npm run check:content     # runs `build-content.mjs --check` first; part of CI
 *
 * Options: --root <dir> validates another checkout (the unit tests use fixtures).
 */

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { REPO_ROOT, loadContent, readImageBytes } from './lib/content-files.mjs';
import { validateContent } from './lib/content-rules.mjs';

const { values: args } = parseArgs({ options: { root: { type: 'string' } } });
const root = args.root ? resolve(args.root) : REPO_ROOT;

const content = loadContent(root);
const { errors, warnings } = validateContent(content, readImageBytes(root));

for (const warning of warnings) console.warn(`! ${warning}`);
for (const error of errors) console.error(`✗ ${error}`);
if (errors.length > 0) {
  console.error(`check:content failed with ${errors.length} error(s)`);
  process.exit(1);
}
console.log(
  `✓ content: ${content.topics.length} topics, ${content.words.length} words, ${content.prompts.length} prompts, ` +
    `${content.stories.length} stories, ${content.stickers.length} stickers`
);
