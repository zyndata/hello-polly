/**
 * One lesson = one island (PLAN.md "A lesson"), composed as a list of steps. Which exercise
 * shows each pick (E1, E2, E3) and its distractors are the Phase 5 player's choice; this only
 * decides which words, how many, in what order, and how many pictures to choose from.
 */

import type { Day, WordId, WordPlan } from '../types';
import { isDue, type WordState } from './learning';

export const MAX_STEPS = 12;
export const MIN_STEPS = 8;
export const MAX_NEW_WORDS = 3;
/** Picks per new word, always out of 2 pictures, in the lesson that introduces it. */
export const PICKS_PER_NEW_WORD = 2;

export type Choices = 2 | 3 | 4;

export type LessonStep =
  | { kind: 'introduce'; word: WordId }
  | { kind: 'pick'; word: WordId; choices: Choices; reason: 'new' | 'review' | 'practice' };

/** New words for a lesson, given how many reviews are due: 3 / 2 / 1 / 0. */
export function newWordCount(dueCount: number): number {
  return Math.max(0, MAX_NEW_WORDS - Math.floor(dueCount / 4));
}

/** How many pictures a review offers: more as the word sits in a higher box. */
export function reviewChoices(box: number): Choices {
  return box <= 2 ? 2 : box <= 4 ? 3 : 4;
}

export interface LessonInput {
  plan: WordPlan;
  states: ReadonlyMap<WordId, WordState>;
  /** From `nextWords`, in order. */
  candidates: readonly WordId[];
  today: Day;
}

export function composeLesson({ plan, states, candidates, today }: LessonInput): LessonStep[] {
  const paused = new Set(plan.paused);
  const known = new Set(plan.known);
  const active = [...states].filter(([id]) => !paused.has(id) && !known.has(id));

  // Most overdue first; a word learned in the compacted past (no due day) is the most overdue.
  const due = active
    .filter(([, s]) => isDue(s, today))
    .sort(([a, x], [b, y]) => (x.due ?? '').localeCompare(y.due ?? '') || a.localeCompare(b));

  const fresh = candidates.slice(0, newWordCount(due.length));
  const intro: LessonStep[] = fresh.map((word) => ({ kind: 'introduce', word }));
  const newPicks: LessonStep[] = [];
  for (let round = 0; round < PICKS_PER_NEW_WORD; round++) {
    for (const word of fresh) newPicks.push({ kind: 'pick', word, choices: 2, reason: 'new' });
  }

  let room = MAX_STEPS - intro.length - newPicks.length;
  const others: LessonStep[] = due
    .slice(0, Math.max(0, room))
    .map(([word, s]) => ({ kind: 'pick', word, choices: reviewChoices(s.box ?? 1), reason: 'review' }));
  room -= others.length;

  // Top up a short lesson with words still being practised, least practised first.
  const short = MIN_STEPS - (intro.length + newPicks.length + others.length);
  if (short > 0) {
    const practising = active
      .filter(([, s]) => s.status === 'practising' || s.status === 'introduced')
      .sort(([a, x], [b, y]) => x.firstTries - y.firstTries || a.localeCompare(b));
    for (const [word] of practising.slice(0, Math.min(short, room))) {
      others.push({ kind: 'pick', word, choices: 2, reason: 'practice' });
    }
  }

  // Look and listen first, then new-word picks alternating with the rest.
  const practice: LessonStep[] = [];
  for (let i = 0; i < Math.max(newPicks.length, others.length); i++) {
    const a = newPicks[i];
    const b = others[i];
    if (a) practice.push(a);
    if (b) practice.push(b);
  }
  return [...intro, ...practice];
}
