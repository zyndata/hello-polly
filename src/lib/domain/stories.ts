/**
 * Stories (PLAN.md "Stories"; STATE.md decisions 84–87): which words a story has, when it
 * unlocks, which picture bounces while which word is spoken, and recording a story heard.
 * Pure; the story player and the shelf go through these.
 */

import { POLISH_RATE } from '../speech/speaker';
import { estimateMs, wordRanges } from '../speech/timing';
import type { ChildId, DeviceId, DeviceProgress, FamilyFile, Story, StoryPage, Word, WordId } from '../types';
import { emptyProgress } from './family';
import type { WordState } from './learning';

/** A story opens when at least this share of its words is learned. */
export const UNLOCK_SHARE = 0.8;
/** After a page's sentence, the page stays this long before it turns by itself. */
export const PAGE_HOLD_MS = 2600;
/** The page turn itself. */
export const PAGE_TURN_MS = 500;
/** Before the first page, after the Polish intro. */
export const INTRO_PAUSE_MS = 400;

/** The distinct words of the story's pictures, in order of appearance (decision 84). */
export function storyWords(story: Pick<Story, 'pages'>): WordId[] {
  const seen = new Set<WordId>();
  for (const page of story.pages) for (const item of page.scene) if (item.word) seen.add(item.word);
  return [...seen];
}

/** How many of the story's words are learned, and how many it has. */
export function storyProgress(story: Pick<Story, 'pages'>, states: ReadonlyMap<WordId, WordState>): { learned: number; total: number } {
  const words = storyWords(story);
  return { learned: words.filter((id) => states.get(id)?.status === 'learned').length, total: words.length };
}

/** At least 80 % of the story's words learned. */
export function storyOpen(story: Pick<Story, 'pages'>, states: ReadonlyMap<WordId, WordState>): boolean {
  const { learned, total } = storyProgress(story, states);
  return total > 0 && learned >= Math.ceil(total * UNLOCK_SHARE);
}

/** Times the story was heard to the end, on every device. */
export function timesHeard(progress: Record<DeviceId, DeviceProgress> | undefined, story: string): number {
  return Object.values(progress ?? {}).reduce((sum, d) => sum + (d.storiesHeard[story] ?? 0), 0);
}

/** Open and never heard on any device: Polly announces it, and its tile glows (decision 87). */
export const storyIsNew = (
  story: Pick<Story, 'id' | 'pages'>,
  states: ReadonlyMap<WordId, WordState>,
  progress: Record<DeviceId, DeviceProgress> | undefined
): boolean => storyOpen(story, states) && timesHeard(progress, story.id) === 0;

/** The story heard to the end once more, on this device. */
export function recordStory(file: FamilyFile, child: ChildId, device: DeviceId, story: string): FamilyFile {
  const perDevice = file.progress[child] ?? {};
  const current = perDevice[device] ?? emptyProgress();
  const heard = { ...current.storiesHeard, [story]: (current.storiesHeard[story] ?? 0) + 1 };
  return {
    ...file,
    progress: { ...file.progress, [child]: { ...perDevice, [device]: { ...current, storiesHeard: heard, seq: current.seq + 1 } } }
  };
}

/** Lower-cased word tokens, the same way the content validator splits a sentence. */
const tokens = (text: string): string[] => text.toLowerCase().match(/[a-z]+(?:'[a-z]+)*/g) ?? [];

/**
 * For each word of the page's sentence (as `wordRanges` numbers them, the numbering of the
 * speech highlight), the scene items it names: the items whose word is spoken there. A word
 * of two tokens names its item on each of them.
 */
export function mentions(page: StoryPage, lookup: (id: WordId) => Pick<Word, 'en'> | undefined): number[][] {
  const spoken = wordRanges(page.text).map((r) => r.text.toLowerCase());
  return spoken.map((token) =>
    page.scene.flatMap((item, i) => {
      const en = item.word ? lookup(item.word)?.en : undefined;
      return en && tokens(en).includes(token) ? [i] : [];
    })
  );
}

/**
 * The story's estimated length at a rate, in ms: the Polish intro, then every page's sentence
 * by decision 28's estimate, its hold and its turn. What the 25–40 s rule is tested against;
 * a real phone is what the acceptance criterion measures.
 */
export function estimateStoryMs(story: Pick<Story, 'pages' | 'introPl'>, rate: number): number {
  const intro = story.introPl ? estimateMs(story.introPl, POLISH_RATE) + INTRO_PAUSE_MS : 0;
  return story.pages.reduce((sum, page) => sum + estimateMs(page.text, rate) + PAGE_HOLD_MS + PAGE_TURN_MS, intro);
}
