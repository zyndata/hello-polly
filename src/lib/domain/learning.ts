/**
 * Word states and the review schedule (PLAN.md "Learning model", made exact in STATE.md
 * decision 17). Everything here is derived from the merged attempt history, never stored, so
 * every device computes the same state.
 */

import { OLD_BUCKET, type AttemptDay, type Day, type DeviceId, type DeviceProgress, type Topic, type WordId, type WordPlan } from '../types';
import { seededShuffle } from './random';
import { addDays } from './time';

/** Days until the next review, per Leitner box 1–6. */
export const BOX_INTERVALS = [1, 2, 4, 7, 14, 30] as const;
export const MAX_BOX = BOX_INTERVALS.length;

/** First-try correct answers, on at least this many different days, make a word learned. */
export const LEARNED_FIRST_TRIES = 3;
export const LEARNED_DAYS = 2;

export type WordStatus = 'new' | 'introduced' | 'practising' | 'learned';

export interface WordState {
  status: WordStatus;
  /** Σ first-try correct answers. */
  firstTries: number;
  /** Learned words only: the Leitner box, 1–6. */
  box?: number;
  /** Learned words only: the next review day. Absent means due now (learned in `"old"`). */
  due?: Day;
}

/** One word's attempts across every device of one child, summed per day. */
export interface WordHistory {
  old?: Required<AttemptDay>;
  /** Real days, oldest first. */
  days: [Day, AttemptDay][];
}

type ChildProgress = Record<DeviceId, DeviceProgress>;

/** Every word's history and whether any device introduced it. */
export function wordHistories(progress: ChildProgress | undefined): {
  histories: Map<WordId, WordHistory>;
  introduced: Set<WordId>;
} {
  const sums = new Map<WordId, Map<Day, Required<AttemptDay>>>();
  const introduced = new Set<WordId>();
  for (const device of Object.values(progress ?? {})) {
    for (const word of Object.keys(device.introduced)) introduced.add(word);
    for (const [word, byDay] of Object.entries(device.attempts)) {
      let perDay = sums.get(word);
      if (!perDay) sums.set(word, (perDay = new Map()));
      for (const [day, a] of Object.entries(byDay)) {
        const s = perDay.get(day) ?? { c: 0, w: 0, first: 0, days: 0 };
        s.c += a.c;
        s.w += a.w;
        s.first += a.first;
        s.days += day === OLD_BUCKET ? (a.days ?? (a.first > 0 ? 1 : 0)) : 0;
        perDay.set(day, s);
      }
    }
  }
  const histories = new Map<WordId, WordHistory>();
  for (const [word, perDay] of sums) {
    const history: WordHistory = { days: [] };
    for (const [day, a] of perDay) {
      if (day === OLD_BUCKET) history.old = a;
      else history.days.push([day, { c: a.c, w: a.w, first: a.first }]);
    }
    history.days.sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
    histories.set(word, history);
  }
  return { histories, introduced };
}

/** The state of one word from its history. */
export function deriveWordState(history: WordHistory | undefined, introduced: boolean): WordState {
  if (!history || (history.days.length === 0 && !history.old)) {
    return { status: introduced ? 'introduced' : 'new', firstTries: 0 };
  }

  let firstTries = 0;
  let firstDays = 0;
  let learned = false;
  let box = 0;
  let due: Day | undefined;

  if (history.old) {
    firstTries = history.old.first;
    firstDays = history.old.days;
    if (firstTries >= LEARNED_FIRST_TRIES && firstDays >= LEARNED_DAYS) {
      // Learned more than four months ago: box 1, due at once (STATE.md decision 16).
      learned = true;
      box = 1;
    }
  }

  for (const [day, a] of history.days) {
    if (!learned) {
      firstTries += a.first;
      if (a.first > 0) firstDays++;
      if (firstTries >= LEARNED_FIRST_TRIES && firstDays >= LEARNED_DAYS) {
        learned = true;
        box = 1;
        due = addDays(day, BOX_INTERVALS[0]);
      }
      continue;
    }
    firstTries += a.first;
    const missed = a.c - a.first > 0;
    if (missed) box = Math.max(1, box - 1);
    else if (due === undefined || day >= due) box = Math.min(MAX_BOX, box + 1);
    else continue; // clean practice before the due date changes nothing
    due = addDays(day, BOX_INTERVALS[box - 1] as number);
  }

  if (!learned) return { status: 'practising', firstTries };
  const state: WordState = { status: 'learned', firstTries, box };
  if (due !== undefined) state.due = due;
  return state;
}

/** Every word with any record for this child, by id. Words with no record are `new`. */
export function wordStates(progress: ChildProgress | undefined): Map<WordId, WordState> {
  const { histories, introduced } = wordHistories(progress);
  const states = new Map<WordId, WordState>();
  for (const word of new Set([...histories.keys(), ...introduced])) {
    states.set(word, deriveWordState(histories.get(word), introduced.has(word)));
  }
  return states;
}

export const NEW_WORD: WordState = { status: 'new', firstTries: 0 };

/** A learned word whose review day has come. */
export function isDue(state: WordState, today: Day): boolean {
  return state.status === 'learned' && (state.due === undefined || state.due <= today);
}

/**
 * The words to introduce next, in order (PLAN.md "Choosing the next words"): the parent's
 * queue, then the enabled topics in map order, each in its default order or a shuffle fixed by
 * `seed` (the child id) and the topic. Only `new` words; known and paused are skipped, and so
 * is any id the current content does not have.
 */
export function nextWords(
  plan: WordPlan,
  states: ReadonlyMap<WordId, WordState>,
  topics: readonly Topic[],
  seed: string,
  limit = Infinity
): WordId[] {
  const exists = new Set(topics.flatMap((t) => t.words));
  const skip = new Set([...plan.known, ...plan.paused]);
  const out: WordId[] = [];
  const seen = new Set<WordId>();
  const consider = (id: WordId) => {
    if (out.length >= limit || seen.has(id)) return;
    seen.add(id);
    if (exists.has(id) && !skip.has(id) && (states.get(id) ?? NEW_WORD).status === 'new') out.push(id);
  };

  plan.queue.forEach(consider);
  const enabled = new Set(plan.enabledTopics);
  for (const topic of [...topics].sort((a, b) => a.order - b.order)) {
    if (!enabled.has(topic.id)) continue;
    const order = plan.randomWithinTopic ? seededShuffle(topic.words, `${seed}/${topic.id}`) : topic.words;
    order.forEach(consider);
  }
  return out;
}
