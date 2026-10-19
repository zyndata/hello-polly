/**
 * Writing this device's progress for a child. Only the owning device writes its subtree, and
 * every change bumps `seq`, so the newer copy wins the merge (PLAN.md "Sync model").
 */

import type { ChestOpening, ChildId, Day, DeviceId, DeviceProgress, FamilyFile, Instant, LessonRecord, WordId } from '../types';
import { emptyProgress } from './family';

type ChildProgress = Record<DeviceId, DeviceProgress> | undefined;

function change(file: FamilyFile, child: ChildId, device: DeviceId, edit: (p: DeviceProgress) => DeviceProgress | undefined): FamilyFile {
  const perDevice = file.progress[child] ?? {};
  const current = perDevice[device] ?? emptyProgress();
  const edited = edit(current);
  if (!edited) return file;
  return {
    ...file,
    progress: { ...file.progress, [child]: { ...perDevice, [device]: { ...edited, seq: current.seq + 1 } } }
  };
}

/** The word shown for the first time on this device at `at`; a word seen before keeps its time. */
export function recordIntroduced(file: FamilyFile, child: ChildId, device: DeviceId, word: WordId, at: Instant): FamilyFile {
  return change(file, child, device, (p) =>
    word in p.introduced ? undefined : { ...p, introduced: { ...p.introduced, [word]: at } }
  );
}

/** A finished lesson, under an event id unique to it. Recording the same id twice changes nothing. */
export function recordLesson(file: FamilyFile, child: ChildId, device: DeviceId, id: string, lesson: LessonRecord): FamilyFile {
  return change(file, child, device, (p) =>
    id in p.lessons ? undefined : { ...p, lessons: { ...p.lessons, [id]: { at: lesson.at, words: [...lesson.words] } } }
  );
}

/**
 * One solved exercise for `word` on `day` (STATE.md decision 44): one correct answer, the wrong
 * taps before it, and a first-try correct when there were none.
 */
export function recordAttempt(file: FamilyFile, child: ChildId, device: DeviceId, word: WordId, day: Day, misses: number): FamilyFile {
  const wrong = Math.max(0, Math.floor(misses));
  return change(file, child, device, (p) => {
    const byDay = p.attempts[word] ?? {};
    const a = byDay[day] ?? { c: 0, w: 0, first: 0 };
    const next = { ...a, c: a.c + 1, w: a.w + wrong, first: a.first + (wrong === 0 ? 1 : 0) };
    return { ...p, attempts: { ...p.attempts, [word]: { ...byDay, [day]: next } } };
  });
}

/** Stars earned on this device. Monotonic: nothing is ever taken away. */
export function addStars(file: FamilyFile, child: ChildId, device: DeviceId, stars: number): FamilyFile {
  const n = Math.floor(stars);
  return change(file, child, device, (p) => (n > 0 ? { ...p, stars: p.stars + n } : undefined));
}

/** Lessons finished on every device: the islands with a flag. */
export function lessonsDone(progress: ChildProgress): number {
  return Object.values(progress ?? {}).reduce((sum, d) => sum + Object.keys(d.lessons).length, 0);
}

/**
 * A chest opened on this device, under an event id unique to it (STATE.md decision 59).
 * Recording the same id twice changes nothing, so a retried save cannot open a second chest.
 */
export function recordChest(file: FamilyFile, child: ChildId, device: DeviceId, id: string, opening: ChestOpening): FamilyFile {
  return change(file, child, device, (p) =>
    id in p.chestsOpened ? undefined : { ...p, chestsOpened: { ...p.chestsOpened, [id]: { at: opening.at, stickers: [...opening.stickers] } } }
  );
}
