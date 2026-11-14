/**
 * One lesson = one island (PLAN.md "A lesson"), composed as a list of steps. Which exercise
 * shows each pick (E1, E2, E3) and its distractors are the Phase 5 player's choice; this only
 * decides which words, how many, in what order, and how many pictures to choose from.
 *
 * Two kinds of lesson: the parent's next planned lesson, when there is one (STATE.md decision
 * 105), else the automatic one: a few new words and the words met before (decision 104).
 */

import type { ChildId, Day, DeviceId, DeviceProgress, FamilyFile, PlannedLesson, Topic, WordId, WordPlan } from '../types';
import { childPlan } from './children';
import { isDue, NEW_WORD, nextWords, wordHistories, wordStates, type WordState } from './learning';
import { MAX_PLANNED_WORDS, pendingLessons } from './plan';
import { plannedDone } from './progress';

export const MAX_STEPS = 12;
export const MIN_STEPS = 8;
export const MAX_NEW_WORDS = 3;
/** Picks per new word, always out of 2 pictures, in the lesson that introduces it. */
export const PICKS_PER_NEW_WORD = 2;
/** With this many words still being practised, a lesson brings one new word fewer (decision 104). */
export const BACKLOG = 9;
/** Picks per word the parent planned, when the child has met it before. */
export const PICKS_PER_PLANNED_WORD = 2;

export type Choices = 2 | 3 | 4;

export type PickReason = 'new' | 'review' | 'practice';

export type LessonStep =
  | { kind: 'introduce'; word: WordId }
  | { kind: 'pick'; word: WordId; choices: Choices; reason: PickReason };

/**
 * New words for a lesson: 3 / 2 / 1 / 0 as reviews come due (one fewer per four due), and one
 * fewer again while many words are still being practised (decision 104).
 */
export function newWordCount(dueCount: number, backlog = 0): number {
  return Math.max(0, MAX_NEW_WORDS - Math.floor(dueCount / 4) - (backlog >= BACKLOG ? 1 : 0));
}

/** How many pictures a review offers: more as the word sits in a higher box. */
export function reviewChoices(box: number): Choices {
  return box <= 2 ? 2 : box <= 4 ? 3 : 4;
}

/** A word met before, practised: a learned word by its box, else 2 pictures, 3 once it is nearly learned. */
export function practiceChoices(state: WordState): Choices {
  if (state.status === 'learned') return reviewChoices(state.box ?? 1);
  return state.firstTries >= 2 ? 3 : 2;
}

export interface LessonInput {
  plan: WordPlan;
  states: ReadonlyMap<WordId, WordState>;
  /** From `nextWords`, in order. */
  candidates: readonly WordId[];
  today: Day;
  /** Words already answered today, on any device: practised after the others. */
  practisedToday?: ReadonlySet<WordId>;
}

type Entry = [WordId, WordState];

/**
 * The words met before that a lesson may practise, best first: due reviews (most overdue
 * first), then words still being practised (those not seen today first, then the least
 * practised), then learned words not due yet (lowest box first). Paused and known words and
 * the `exclude`d ones are left out.
 */
function practicePool(input: Omit<LessonInput, 'candidates'>, exclude: ReadonlySet<WordId>): { due: Entry[]; rest: Entry[] } {
  const { plan, states, today, practisedToday = new Set() } = input;
  const skip = new Set([...plan.paused, ...plan.known, ...exclude]);
  const active = [...states].filter(([id]) => !skip.has(id));

  // Most overdue first; a word learned in the compacted past (no due day) is the most overdue.
  const due = active
    .filter(([, s]) => isDue(s, today))
    .sort(([a, x], [b, y]) => (x.due ?? '').localeCompare(y.due ?? '') || a.localeCompare(b));
  const seenToday = (id: WordId) => (practisedToday.has(id) ? 1 : 0);
  const practising = active
    .filter(([, s]) => s.status === 'practising' || s.status === 'introduced')
    .sort(([a, x], [b, y]) => seenToday(a) - seenToday(b) || x.firstTries - y.firstTries || a.localeCompare(b));
  const learned = active
    .filter(([, s]) => s.status === 'learned' && !isDue(s, today))
    .sort(([a, x], [b, y]) => (x.box ?? 1) - (y.box ?? 1) || a.localeCompare(b));
  return { due, rest: [...practising, ...learned] };
}

const pickOf = ([word, s]: Entry, isDueNow: boolean): LessonStep => ({
  kind: 'pick',
  word,
  choices: isDueNow ? reviewChoices(s.box ?? 1) : practiceChoices(s),
  reason: isDueNow ? 'review' : 'practice'
});

/** `a` and `b` taken in turns, so that the words of `a` are never next to each other while `b` lasts. */
function interleave(a: readonly LessonStep[], b: readonly LessonStep[]): LessonStep[] {
  const out: LessonStep[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x) out.push(x);
    if (y) out.push(y);
  }
  return out;
}

/** Each of `fresh` introduced, then picked twice out of two pictures, round by round. */
function newWordSteps(fresh: readonly WordId[]): { intro: LessonStep[]; picks: LessonStep[] } {
  const intro: LessonStep[] = fresh.map((word) => ({ kind: 'introduce', word }));
  const picks: LessonStep[] = [];
  for (let round = 0; round < PICKS_PER_NEW_WORD; round++) {
    for (const word of fresh) picks.push({ kind: 'pick', word, choices: 2, reason: 'new' });
  }
  return { intro, picks };
}

/**
 * The automatic lesson (decision 104): up to three new words, each introduced and picked twice,
 * and the rest of the twelve steps for words met before (due reviews, then words still being
 * practised, then learned ones), one pick each. So a lesson always practises earlier words too,
 * which is what lets a word reach "learned" on a second day.
 */
export function composeLesson(input: LessonInput): LessonStep[] {
  const { states, candidates } = input;
  const { due, rest } = practicePool(input, new Set());
  const backlog = rest.filter(([, s]) => s.status !== 'learned').length;

  const fresh = candidates.filter((id) => (states.get(id) ?? NEW_WORD).status === 'new').slice(0, newWordCount(due.length, backlog));
  const { intro, picks } = newWordSteps(fresh);

  const room = Math.max(0, MAX_STEPS - intro.length - picks.length);
  const others = [...due.map((e) => pickOf(e, true)), ...rest.map((e) => pickOf(e, false))].slice(0, room);

  // Look and listen first, then new-word picks alternating with the rest.
  return [...intro, ...interleave(picks, others)];
}

/**
 * A lesson the parent planned (decision 105): its new words introduced and picked twice out of
 * two pictures, its words met before picked twice each, then topped up to eight steps with due
 * and practised words, so a one-word lesson is still a lesson. At most twelve steps.
 */
export function composePlanned(input: Omit<LessonInput, 'candidates'>, words: readonly WordId[]): LessonStep[] {
  const { states, today } = input;
  const chosen = [...new Set(words)].slice(0, MAX_PLANNED_WORDS);
  const fresh = chosen.filter((id) => (states.get(id) ?? NEW_WORD).status === 'new');
  const met = chosen.filter((id) => !fresh.includes(id));
  const { intro, picks } = newWordSteps(fresh);

  const metPicks: LessonStep[] = [];
  for (let round = 0; round < PICKS_PER_PLANNED_WORD; round++) {
    for (const word of met) {
      const s = states.get(word) ?? NEW_WORD;
      metPicks.push(pickOf([word, s], isDue(s, today)));
    }
  }
  const planned = interleave(picks, metPicks).slice(0, MAX_STEPS - intro.length);

  const { due, rest } = practicePool(input, new Set(chosen));
  const short = Math.max(0, MIN_STEPS - intro.length - planned.length);
  const others = [...due.map((e) => pickOf(e, true)), ...rest.map((e) => pickOf(e, false))].slice(0, short);
  return [...intro, ...interleave(planned, others)];
}

/** Words answered on `today` on any device. */
export function practisedOn(progress: Record<DeviceId, DeviceProgress> | undefined, today: Day): Set<WordId> {
  const out = new Set<WordId>();
  for (const [word, history] of wordHistories(progress).histories) {
    if (history.days.some(([day]) => day === today)) out.add(word);
  }
  return out;
}

export interface NextLesson {
  steps: LessonStep[];
  /** The parent's planned lesson these steps play, if any. */
  planned?: string;
}

/** The next lesson of one child, from the merged family file: the parent's next planned one, else the automatic one. */
export function nextLesson(file: FamilyFile, child: ChildId, topics: readonly Topic[], today: Day): NextLesson {
  const plan = childPlan(file, child);
  const progress = file.progress[child];
  const states = wordStates(progress);
  const input = { plan, states, today, practisedToday: practisedOn(progress, today) };
  const exists = new Set(topics.flatMap((t) => t.words));
  const planned: PlannedLesson | undefined = pendingLessons(plan, plannedDone(progress), exists)[0];
  if (planned) {
    const steps = composePlanned(input, planned.words.filter((id) => exists.has(id)));
    if (steps.length > 0) return { steps, planned: planned.id };
  }
  return { steps: composeLesson({ ...input, candidates: nextWords(plan, states, topics, child) }) };
}

/** The steps of the next lesson of one child. */
export const lessonFor = (file: FamilyFile, child: ChildId, topics: readonly Topic[], today: Day): LessonStep[] =>
  nextLesson(file, child, topics, today).steps;

/** The words a lesson introduces, in order. */
export const introducedBy = (steps: readonly Pick<LessonStep, 'kind' | 'word'>[]): WordId[] =>
  steps.flatMap((s) => (s.kind === 'introduce' ? [s.word] : []));
