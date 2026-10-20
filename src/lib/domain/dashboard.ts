/**
 * The parent's progress dashboard (PLAN.md Phase 10 task 3; STATE.md decision 96): learned
 * words per topic, the words that need practice, a 4-week activity calendar, stickers collected
 * and stories heard. All derived from every device's progress, never stored.
 */

import { OLD_BUCKET, type Day, type DeviceId, type DeviceProgress, type Sticker, type Story, type Topic, type WordId, type WordPlan } from '../types';
import { NEW_WORD, wordHistories, type WordState } from './learning';
import { album } from './rewards';
import { timesHeard } from './stories';
import { addDays, localDay, weekday } from './time';

type ChildProgress = Record<DeviceId, DeviceProgress> | undefined;

const devices = (progress: ChildProgress) => Object.values(progress ?? {});

export interface TopicProgress {
  topic: Topic;
  learned: number;
  /** Words met at all (any state but new), learned included. */
  met: number;
  total: number;
}

/** Per topic in map order: the enabled ones, and any other with a word already met. */
export function learnedPerTopic(states: ReadonlyMap<WordId, WordState>, plan: WordPlan, topics: readonly Topic[]): TopicProgress[] {
  const enabled = new Set(plan.enabledTopics);
  return [...topics]
    .sort((a, b) => a.order - b.order)
    .map((topic) => {
      const of = topic.words.map((id) => (states.get(id) ?? NEW_WORD).status);
      return {
        topic,
        learned: of.filter((s) => s === 'learned').length,
        met: of.filter((s) => s !== 'new').length,
        total: topic.words.length
      };
    })
    .filter((t) => enabled.has(t.topic.id) || t.met > 0);
}

export interface PracticeWord {
  word: WordId;
  /** Exercises not solved on the first try, over every day and device. */
  misses: number;
  /** The last day with such a miss; `undefined` when they are all in the compacted bucket. */
  lastMiss?: Day;
}

/** Words that need practice: the most first-try misses first, then the most recent (decision 96). */
export function needsPractice(progress: ChildProgress, exists: (id: WordId) => boolean, limit = 8): PracticeWord[] {
  const out: PracticeWord[] = [];
  for (const [word, history] of wordHistories(progress).histories) {
    if (!exists(word)) continue;
    let misses = history.old ? history.old.c - history.old.first : 0;
    let lastMiss: Day | undefined;
    for (const [day, a] of history.days) {
      if (a.c - a.first > 0) {
        misses += a.c - a.first;
        lastMiss = day;
      }
    }
    if (misses > 0) out.push(lastMiss === undefined ? { word, misses } : { word, misses, lastMiss });
  }
  return out
    .sort((a, b) => b.misses - a.misses || (b.lastMiss ?? '').localeCompare(a.lastMiss ?? '') || (a.word < b.word ? -1 : 1))
    .slice(0, limit);
}

/** Minutes played on each day, summed across devices. */
export function minutesByDay(progress: ChildProgress): Map<Day, number> {
  const sums = new Map<Day, number>();
  for (const d of devices(progress)) for (const [day, n] of Object.entries(d.minutes)) sums.set(day, (sums.get(day) ?? 0) + n);
  return sums;
}

/** Days with any answer or finished lesson on any device (a session under a minute still shows). */
export function activeDays(progress: ChildProgress): Set<Day> {
  const days = new Set<Day>();
  for (const d of devices(progress)) {
    for (const byDay of Object.values(d.attempts)) for (const day of Object.keys(byDay)) if (day !== OLD_BUCKET) days.add(day);
    for (const lesson of Object.values(d.lessons)) days.add(localDay(new Date(lesson.at)));
  }
  return days;
}

export interface CalendarDay {
  day: Day;
  minutes: number;
  /** Played at all, even for less than a minute. */
  active: boolean;
  /** 0 (nothing) to 3 (a long day), for the shading. */
  level: 0 | 1 | 2 | 3;
  /** After today: an empty cell that completes the week. */
  future: boolean;
}

/** The shading steps of the calendar, in minutes: up to 5, up to 15, more. */
export const LEVEL_MINUTES = [5, 15] as const;

function level(minutes: number, active: boolean): CalendarDay['level'] {
  if (minutes > LEVEL_MINUTES[1]) return 3;
  if (minutes > LEVEL_MINUTES[0]) return 2;
  return minutes > 0 || active ? 1 : 0;
}

/** `weeks` Monday-first weeks, the last one holding `today`; days after today are `future`. */
export function activityCalendar(progress: ChildProgress, today: Day, weeks = 4): CalendarDay[][] {
  const minutes = minutesByDay(progress);
  const active = activeDays(progress);
  const start = addDays(today, -weekday(today) - 7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, w * 7 + i);
      const future = day > today;
      const n = future ? 0 : (minutes.get(day) ?? 0);
      const played = !future && (n > 0 || active.has(day));
      return { day, minutes: n, active: played, level: future ? 0 : level(n, played), future };
    })
  );
}

/** Minutes over the last `days` days up to today, summed across devices. */
export function recentMinutes(progress: ChildProgress, today: Day, days: number): number {
  const minutes = minutesByDay(progress);
  let sum = 0;
  for (let i = 0; i < days; i++) sum += minutes.get(addDays(today, -i)) ?? 0;
  return sum;
}

export interface StickerSet {
  set: string;
  owned: number;
  total: number;
}

/** Stickers owned of all, and per set in the order the sets first appear. */
export function stickersCollected(progress: ChildProgress, stickers: readonly Sticker[]): { owned: number; total: number; sets: StickerSet[] } {
  const owned = album(progress);
  const sets = new Map<string, StickerSet>();
  for (const s of stickers) {
    const entry = sets.get(s.set) ?? { set: s.set, owned: 0, total: 0 };
    entry.total += 1;
    if (owned.has(s.id)) entry.owned += 1;
    sets.set(s.set, entry);
  }
  const all = [...sets.values()];
  return { owned: all.reduce((n, s) => n + s.owned, 0), total: stickers.length, sets: all };
}

/** Every story with the times it was heard to the end, over every device. */
export function storiesHeard(progress: ChildProgress, stories: readonly Pick<Story, 'id'>[]): { story: string; times: number }[] {
  return stories.map((s) => ({ story: s.id, times: timesHeard(progress, s.id) }));
}
