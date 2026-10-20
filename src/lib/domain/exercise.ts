/**
 * Exercises: which pictures a pick offers, how a tap is answered, and the stars a run of
 * answers earns (PLAN.md "Exercises and games"; STATE.md decisions 41–45). Pure and seeded, so
 * the lesson a child sees is fixed by its id and testable.
 */

import type { Word, WordId, WordPlan } from '../types';
import { NEW_WORD, type WordState } from './learning';
import { introducedBy, reviewChoices, type LessonStep } from './lesson';
import { seededShuffle } from './random';

type WordInfo = Pick<Word, 'id' | 'en' | 'say' | 'image' | 'topic'>;

/** A lesson step ready to play: a pick knows its pictures, target included, in screen order. */
export type PlayStep =
  | { kind: 'introduce'; word: WordId }
  | { kind: 'pick'; word: WordId; choices: WordId[]; reason: 'new' | 'review' | 'practice' };

const spoken = (w: WordInfo) => (w.say ?? w.en).trim().toLowerCase();

/**
 * The target and up to `count − 1` distractors, shuffled by `seed`. Distractors come from the
 * tiers in order (each tier shuffled), skipping any word that sounds like the target or shows
 * the same picture as a word already chosen. Fewer pictures only when no word is left.
 */
export function pickChoices(
  target: WordId,
  count: number,
  tiers: readonly (readonly WordId[])[],
  seed: string,
  lookup: (id: WordId) => WordInfo | undefined
): WordId[] {
  const t = lookup(target);
  if (!t) return [];
  const chosen: WordInfo[] = [t];
  for (const [i, tier] of tiers.entries()) {
    for (const id of seededShuffle(tier, `${seed}/tier${i}`)) {
      if (chosen.length >= count) break;
      const w = lookup(id);
      if (!w || chosen.some((c) => c.id === w.id || c.image === w.image || spoken(c) === spoken(w))) continue;
      chosen.push(w);
    }
  }
  return seededShuffle(
    chosen.map((w) => w.id),
    `${seed}/order`
  );
}

export interface ChoiceContext {
  plan: WordPlan;
  states: ReadonlyMap<WordId, WordState>;
  /** Every word of the content. */
  words: readonly WordInfo[];
}

/**
 * The lesson's steps with their pictures (decision 42). A new word's 2-choice pick takes the
 * lesson's other new words first; every other pick avoids the lesson's new words entirely, so
 * a new word is never seen in a step with more than two pictures.
 */
export function planLesson(steps: readonly LessonStep[], ctx: ChoiceContext, seed: string): PlayStep[] {
  const fresh = new Set(introducedBy(steps));
  const paused = new Set(ctx.plan.paused);
  const byId = new Map(ctx.words.map((w) => [w.id, w]));
  const lookup = (id: WordId) => byId.get(id);
  const usable = (id: WordId) => !paused.has(id);
  const met = ctx.words.map((w) => w.id).filter((id) => usable(id) && (ctx.states.get(id) ?? NEW_WORD).status !== 'new');

  return steps.map((step, i): PlayStep => {
    if (step.kind === 'introduce') return step;
    const topic = byId.get(step.word)?.topic;
    const isNew = step.reason === 'new';
    const allowed = (id: WordId) => usable(id) && (isNew || !fresh.has(id));
    const tiers = [
      isNew ? [...fresh].filter((id) => id !== step.word) : [],
      met.filter(allowed),
      ctx.words.filter((w) => w.topic === topic).map((w) => w.id).filter(allowed),
      ctx.words.map((w) => w.id).filter(allowed)
    ];
    const count = isNew ? 2 : step.choices;
    return { kind: 'pick', word: step.word, reason: step.reason, choices: pickChoices(step.word, count, tiers, `${seed}/${i}`, lookup) };
  });
}

/** Picks in free play (E1 on the game shelf): learned words only, pictures by box. */
export function planListenGame(learned: readonly WordId[], ctx: ChoiceContext, seed: string, rounds = 5): PlayStep[] {
  if (learned.length === 0) return [];
  const byId = new Map(ctx.words.map((w) => [w.id, w]));
  const paused = new Set(ctx.plan.paused);
  const met = ctx.words.map((w) => w.id).filter((id) => !paused.has(id) && (ctx.states.get(id) ?? NEW_WORD).status !== 'new');
  const order = seededShuffle(learned, `${seed}/targets`);
  return Array.from({ length: rounds }, (_, i) => {
    const word = order[i % order.length] as WordId;
    const count = reviewChoices(ctx.states.get(word)?.box ?? 1);
    const choices = pickChoices(word, count, [learned, met], `${seed}/${i}`, (id) => byId.get(id));
    return { kind: 'pick', word, reason: 'review', choices };
  });
}

/**
 * Rounds of "hear a word, find its picture" over learned words with a fixed number of pictures
 * (E4 *Bańki*, E5 *Nakarm Polly*; decision 88): every learned word is a target once before
 * any is asked again, and distractors come from learned words only.
 */
export function planPicks(learned: readonly WordId[], ctx: Pick<ChoiceContext, 'words'>, seed: string, rounds = 5, choices = 3): PlayStep[] {
  if (learned.length === 0) return [];
  const byId = new Map(ctx.words.map((w) => [w.id, w]));
  const order = seededShuffle(learned, `${seed}/targets`);
  return Array.from({ length: rounds }, (_, i) => {
    const word = order[i % order.length] as WordId;
    return { kind: 'pick', word, reason: 'review', choices: pickChoices(word, choices, [learned], `${seed}/${i}`, (id) => byId.get(id)) };
  });
}

/** How a tap is answered (decision 43). The second miss, and every one after it, glows. */
export type Reaction = 'correct' | 'retry' | 'hint';
export const HINT_AFTER_MISSES = 2;

/** `misses` counts the wrong taps before this one. */
export function react(misses: number, correct: boolean): Reaction {
  if (correct) return 'correct';
  return misses + 1 >= HINT_AFTER_MISSES ? 'hint' : 'retry';
}

/** Answers in a row this long earn a bonus star. */
export const STREAK = 3;

/** One bonus star per `STREAK` first-try answers in a row (a run of 7 gives 2). */
export function streakBonus(firstTries: readonly boolean[]): number {
  let bonus = 0;
  let run = 0;
  for (const first of firstTries) {
    run = first ? run + 1 : 0;
    if (run > 0 && run % STREAK === 0) bonus++;
  }
  return bonus;
}

/** Stars for a lesson or a game: one per step solved, plus the streak bonus (decision 45). */
export const starsFor = (steps: number, firstTries: readonly boolean[]): number => steps + streakBonus(firstTries);
