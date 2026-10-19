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
/** English praise for a correct answer, spoken by the English voice. */
export const praise: readonly string[] = praiseJson;

const wordById = new Map(words.map((w) => [w.id, w]));
const topicById = new Map(topics.map((t) => [t.id, t]));
const promptById = new Map((promptsJson as Prompt[]).map((p) => [p.id, p.pl]));

export const word = (id: WordId): Word | undefined => wordById.get(id);
export const topic = (id: TopicId): Topic | undefined => topicById.get(id);

/** The Polish text of a prompt. `check:content` guarantees every `PromptId` is present. */
export function prompt(id: PromptId): string {
  return promptById.get(id) ?? '';
}
