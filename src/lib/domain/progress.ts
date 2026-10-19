/**
 * Writing this device's progress for a child. Only the owning device writes its subtree, and
 * every change bumps `seq`, so the newer copy wins the merge (PLAN.md "Sync model").
 */

import type { ChildId, DeviceId, DeviceProgress, FamilyFile, Instant, LessonRecord, WordId } from '../types';
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

/** Lessons finished on every device: the islands with a flag. */
export function lessonsDone(progress: ChildProgress): number {
  return Object.values(progress ?? {}).reduce((sum, d) => sum + Object.keys(d.lessons).length, 0);
}
