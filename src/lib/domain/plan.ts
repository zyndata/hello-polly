/**
 * Editing a word plan (PLAN.md "Choosing the next words"). A word is at most one of queued,
 * known and paused: marking one removes it from the other two (STATE.md decision 34). Every
 * function returns a new plan and leaves its input alone.
 */

import type { PlannedLesson, TopicId, WordId, WordPlan } from '../types';
import type { WordState, WordStatus } from './learning';
import { NEW_WORD } from './learning';

const without = (list: readonly WordId[], word: WordId) => list.filter((w) => w !== word);

function clear(plan: WordPlan, word: WordId): WordPlan {
  return { ...plan, queue: without(plan.queue, word), known: without(plan.known, word), paused: without(plan.paused, word) };
}

/** Appended to the queue (if not there yet); no longer known or paused. */
export function enqueue(plan: WordPlan, word: WordId): WordPlan {
  if (plan.queue.includes(word)) return plan;
  const next = clear(plan, word);
  return { ...next, queue: [...next.queue, word] };
}

export function dequeue(plan: WordPlan, word: WordId): WordPlan {
  return { ...plan, queue: without(plan.queue, word) };
}

/** The queued word moved by `delta` places, kept within the queue. */
export function moveQueued(plan: WordPlan, word: WordId, delta: number): WordPlan {
  const from = plan.queue.indexOf(word);
  if (from < 0) return plan;
  const to = Math.max(0, Math.min(plan.queue.length - 1, from + delta));
  if (to === from) return plan;
  const queue = [...plan.queue];
  queue.splice(from, 1);
  queue.splice(to, 0, word);
  return { ...plan, queue };
}

export function setKnown(plan: WordPlan, word: WordId, on: boolean): WordPlan {
  const next = clear(plan, word);
  return on ? { ...next, known: [...next.known, word] } : next;
}

export function setPaused(plan: WordPlan, word: WordId, on: boolean): WordPlan {
  const next = clear(plan, word);
  return on ? { ...next, paused: [...next.paused, word] } : next;
}

export function setTopicEnabled(plan: WordPlan, topic: TopicId, on: boolean): WordPlan {
  const rest = plan.enabledTopics.filter((t) => t !== topic);
  return { ...plan, enabledTopics: on ? [...rest, topic] : rest };
}

export function setRandomWithinTopic(plan: WordPlan, on: boolean): WordPlan {
  return { ...plan, randomWithinTopic: on };
}

/** *Kosze* on or off for this child (STATE.md decision 89). */
export function setSortGame(plan: WordPlan, on: boolean): WordPlan {
  return { ...plan, sortGame: on };
}

/**
 * The queue as it still matters: the words not met yet. A queued word leaves the queue once it
 * is introduced; the child's device never rewrites the plan for that (a whole-plan `Lww` write
 * from it could undo a parent's edit on another phone), so the parent's next save drops it.
 */
export function pendingQueue(plan: WordPlan, states: ReadonlyMap<WordId, WordState>): WordId[] {
  return plan.queue.filter((id) => (states.get(id) ?? NEW_WORD).status === 'new');
}

export function pruneQueue(plan: WordPlan, states: ReadonlyMap<WordId, WordState>): WordPlan {
  const queue = pendingQueue(plan, states);
  return queue.length === plan.queue.length ? plan : { ...plan, queue };
}

// ---------------------------------------------------------------------------------------------
// Lessons planned ahead (STATE.md decision 105)

/** A planned lesson has at most this many words: four new words fill a twelve-step lesson. */
export const MAX_PLANNED_WORDS = 4;

/** Distinct words, in order, at most `MAX_PLANNED_WORDS`. */
const cleanWords = (words: readonly WordId[]): WordId[] => [...new Set(words)].slice(0, MAX_PLANNED_WORDS);

/**
 * The planned lessons still to play, in order: not finished on any device (`done` holds the
 * finished ones' ids) and with at least one word the content still has.
 */
export function pendingLessons(plan: WordPlan, done: ReadonlySet<string>, exists: ReadonlySet<WordId>): PlannedLesson[] {
  return (plan.lessons ?? []).filter((l) => !done.has(l.id) && l.words.some((id) => exists.has(id)));
}

/** The plan without the planned lessons already finished (the parent's next save drops them). */
export function prunePlanned(plan: WordPlan, done: ReadonlySet<string>): WordPlan {
  const lessons = plan.lessons ?? [];
  const kept = lessons.filter((l) => !done.has(l.id));
  return kept.length === lessons.length ? plan : { ...plan, lessons: kept };
}

/** A new planned lesson at the end. A lesson with no word is not added. */
export function addLesson(plan: WordPlan, id: string, words: readonly WordId[]): WordPlan {
  const clean = cleanWords(words);
  if (clean.length === 0 || (plan.lessons ?? []).some((l) => l.id === id)) return plan;
  return { ...plan, lessons: [...(plan.lessons ?? []), { id, words: clean }] };
}

/** The planned lesson's words replaced; with no word left, the lesson goes. */
export function setLessonWords(plan: WordPlan, id: string, words: readonly WordId[]): WordPlan {
  const clean = cleanWords(words);
  if (clean.length === 0) return removeLesson(plan, id);
  return { ...plan, lessons: (plan.lessons ?? []).map((l) => (l.id === id ? { id, words: clean } : l)) };
}

export function removeLesson(plan: WordPlan, id: string): WordPlan {
  return { ...plan, lessons: (plan.lessons ?? []).filter((l) => l.id !== id) };
}

/** The planned lesson moved by `delta` places, kept within the list. */
export function moveLesson(plan: WordPlan, id: string, delta: number): WordPlan {
  const lessons = [...(plan.lessons ?? [])];
  const from = lessons.findIndex((l) => l.id === id);
  if (from < 0) return plan;
  const to = Math.max(0, Math.min(lessons.length - 1, from + delta));
  if (to === from) return plan;
  const [moved] = lessons.splice(from, 1);
  lessons.splice(to, 0, moved as PlannedLesson);
  return { ...plan, lessons };
}

/** What the parent sees on a word: the plan's mark first, else its learning state. */
export type PlanWordStatus = WordStatus | 'known' | 'paused';

export function planWordStatus(plan: WordPlan, states: ReadonlyMap<WordId, WordState>, word: WordId): PlanWordStatus {
  if (plan.known.includes(word)) return 'known';
  if (plan.paused.includes(word)) return 'paused';
  return (states.get(word) ?? NEW_WORD).status;
}

/** Polish labels for the parent's word list. */
export const STATUS_LABELS: Record<PlanWordStatus, string> = {
  new: 'nowe',
  introduced: 'poznane',
  practising: 'ćwiczy',
  learned: 'umie',
  known: 'zna już',
  paused: 'wstrzymane'
};
