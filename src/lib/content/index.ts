/**
 * The static content, typed. The JSON lives in `content/` at the repository root (validated by
 * `npm run check:content`) and is bundled; pictures are referenced by id only.
 */

import type { REQUIRED_PROMPT_IDS } from '../../../scripts/lib/content-rules.mjs';
import type { ImageId, Prompt, Sticker, Story, Topic, TopicId, Word, WordId } from '../types';
import avatarsJson from '../../../content/avatars.json';
import promptsJson from '../../../content/prompts.json';
import praiseJson from '../../../content/praise.json';
import stickersJson from '../../../content/stickers.json';
import storiesJson from '../../../content/stories.json';
import topicsJson from '../../../content/topics.json';
import wordsJson from '../../../content/words.json';

/** Bumped whenever a change to `content/` matters to stored progress (renamed or removed ids). */
export const CONTENT_VERSION = 1;

export type PromptId = (typeof REQUIRED_PROMPT_IDS)[number];

export const topics: readonly Topic[] = [...(topicsJson as Topic[])].sort((a, b) => a.order - b.order);
export const words: readonly Word[] = wordsJson as Word[];
export const stories: readonly Story[] = storiesJson as Story[];
export const stickers: readonly Sticker[] = stickersJson as Sticker[];
/** The pictures a child profile may use as its avatar. */
export const avatars: readonly ImageId[] = avatarsJson;
/**
 * Praise for a correct answer, in turn: mostly English, spoken by the English voice, and
 * „Bardzo dobrze!” in Polish (STATE.md decision 109).
 */
export interface Praise {
  lang: 'en' | 'pl';
  text: string;
}
export const praise: readonly Praise[] = (praiseJson as ({ en: string } | { pl: string })[]).map((p) =>
  'pl' in p ? { lang: 'pl', text: p.pl } : { lang: 'en', text: p.en }
);

const wordById = new Map(words.map((w) => [w.id, w]));
const topicById = new Map(topics.map((t) => [t.id, t]));
const promptById = new Map((promptsJson as Prompt[]).map((p) => [p.id, [p.pl, ...(p.variants ?? [])]]));
/** The line each prompt said last, so that a prompt with variants never says the same twice in a row. */
const lastLine = new Map<string, string>();

export const word = (id: WordId): Word | undefined => wordById.get(id);
export const topic = (id: TopicId): Topic | undefined => topicById.get(id);

/**
 * The Polish text of a prompt. `check:content` guarantees every `PromptId` is present. A prompt
 * with variants (STATE.md decision 102) says one of its lines at random, never the one it said
 * last time, so Polly's small talk does not repeat itself.
 */
export function prompt(id: PromptId, random: () => number = Math.random): string {
  const lines = promptById.get(id) ?? [];
  if (lines.length < 2) return lines[0] ?? '';
  const fresh = lines.filter((line) => line !== lastLine.get(id));
  const line = fresh[Math.floor(random() * fresh.length)] ?? fresh[0] ?? '';
  lastLine.set(id, line);
  return line;
}

/** Every line a prompt can say: its `pl` first, then its variants. */
export const promptLines = (id: PromptId): readonly string[] => promptById.get(id) ?? [];
