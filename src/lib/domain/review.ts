/**
 * *Powtórka* (STATE.md decision 106): a lesson of words the child has already met, the trouble
 * words first (`needsPractice`), the rest drawn at random. It records answers like any lesson,
 * so a trouble word answered cleanly leaves the list, but it is not an island: no flag, and it
 * never counts as a planned lesson.
 */

import type { ChildId, DeviceId, DeviceProgress, FamilyFile, WordId, WordPlan } from '../types';
import { childPlan } from './children';
import { needsPractice } from './dashboard';
import { NEW_WORD, wordStates, type WordState } from './learning';
import { practiceChoices, type LessonStep } from './lesson';
import { seededShuffle } from './random';

/** Distinct words in one review. */
export const REVIEW_WORDS = 6;
/** The button shows once the child has met this many words. */
export const REVIEW_MIN_WORDS = 3;
/** A trouble word is asked this many times in one review; any other word once. */
export const TROUBLE_PICKS = 2;

export interface ReviewInput {
  plan: WordPlan;
  states: ReadonlyMap<WordId, WordState>;
  progress: Record<DeviceId, DeviceProgress> | undefined;
  exists: (id: WordId) => boolean;
  seed: string;
}

/** Words met before (introduced, practising or learned) that a review may ask: not paused, not known. */
export function reviewable({ plan, states, exists }: Pick<ReviewInput, 'plan' | 'states' | 'exists'>): WordId[] {
  const skip = new Set([...plan.paused, ...plan.known]);
  return [...states]
    .filter(([id, s]) => s.status !== 'new' && !skip.has(id) && exists(id))
    .map(([id]) => id)
    .sort();
}

/**
 * The review's picks: up to `REVIEW_WORDS` words, trouble words first (furthest from mastered
 * first), the rest a random draw fixed by `seed`. Every word is asked once in a shuffled round,
 * then the trouble words a second time, never the same word twice in a row.
 */
export function composeReview(input: ReviewInput): LessonStep[] {
  const pool = reviewable(input);
  if (pool.length < REVIEW_MIN_WORDS) return [];
  const usable = new Set(pool);
  const trouble = needsPractice(input.progress, (id) => usable.has(id), REVIEW_WORDS).map((p) => p.word);
  const rest = seededShuffle(
    pool.filter((id) => !trouble.includes(id)),
    `${input.seed}/rest`
  );
  const chosen = [...trouble, ...rest].slice(0, REVIEW_WORDS);

  const pick = (word: WordId): LessonStep => ({
    kind: 'pick',
    word,
    choices: practiceChoices(input.states.get(word) ?? NEW_WORD),
    reason: 'review'
  });
  const first = seededShuffle(chosen, `${input.seed}/first`);
  const again = seededShuffle(trouble, `${input.seed}/again`).flatMap((w) => Array<WordId>(TROUBLE_PICKS - 1).fill(w));
  // The second round never starts with the word the first one ended on.
  if (again.length > 0 && again[0] === first[first.length - 1]) {
    if (again.length > 1) again.push(again.shift() as WordId);
    else if (first.length > 1) first.splice(first.length - 2, 2, first[first.length - 1] as WordId, first[first.length - 2] as WordId);
  }
  return [...first, ...again].map(pick);
}

/** The review of one child, from the merged family file. */
export function reviewFor(file: FamilyFile, child: ChildId, exists: (id: WordId) => boolean, seed: string): LessonStep[] {
  return composeReview({ plan: childPlan(file, child), states: wordStates(file.progress[child]), progress: file.progress[child], exists, seed });
}

/** Whether the map shows the *Powtórka* button. */
export const reviewOpen = (file: FamilyFile, child: ChildId, exists: (id: WordId) => boolean): boolean =>
  reviewable({ plan: childPlan(file, child), states: wordStates(file.progress[child]), exists }).length >= REVIEW_MIN_WORDS;
