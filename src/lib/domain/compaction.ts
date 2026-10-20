/**
 * Compaction (PLAN.md "Sync model"): attempt days older than 120 days fold into one `"old"`
 * bucket per word, which keeps the family file small for years. Only the device that owns a
 * progress subtree compacts it, and it bumps `seq`, so the compacted copy wins the merge like
 * any other change (STATE.md decision 16).
 */

import { OLD_BUCKET, type AttemptDay, type Day, type DeviceId, type DeviceProgress, type FamilyFile } from '../types';
import { emptyProgress } from './family';
import { canonicalJson } from './lww';
import { daysBetween } from './time';

export const COMPACT_AFTER_DAYS = 120;

/** `progress` with old days folded, or the same object when there is nothing to fold. */
export function compactProgress(progress: DeviceProgress, today: Day): DeviceProgress {
  let changed = false;
  const attempts: DeviceProgress['attempts'] = {};

  for (const [word, byDay] of Object.entries(progress.attempts)) {
    const kept: Record<Day, AttemptDay> = {};
    const prior = byDay[OLD_BUCKET];
    const old: Required<AttemptDay> = {
      c: prior?.c ?? 0,
      w: prior?.w ?? 0,
      first: prior?.first ?? 0,
      days: prior?.days ?? 0
    };
    let folded = false;
    for (const [day, a] of Object.entries(byDay)) {
      if (day === OLD_BUCKET) continue;
      if (daysBetween(day, today) > COMPACT_AFTER_DAYS) {
        old.c += a.c;
        old.w += a.w;
        old.first += a.first;
        old.days += a.first > 0 ? 1 : 0;
        folded = true;
      } else {
        kept[day] = a;
      }
    }
    if (folded || prior) kept[OLD_BUCKET] = old;
    if (folded) changed = true;
    attempts[word] = kept;
  }

  return changed ? { ...progress, seq: progress.seq + 1, attempts } : progress;
}

const isEmpty = (p: DeviceProgress): boolean => canonicalJson({ ...p, seq: 0 }) === canonicalJson(emptyProgress());

/**
 * What a sync pass does to this device's own subtrees before merging (STATE.md decision 69):
 * compaction, and a deleted child's progress emptied (with `seq` bumped, so the merge takes it).
 * Other devices' subtrees are never touched. Returns `file` itself when nothing changed.
 */
export function tidyOwnProgress(file: FamilyFile, device: DeviceId, today: Day): FamilyFile {
  let changed = false;
  const progress: FamilyFile['progress'] = {};
  for (const [child, byDevice] of Object.entries(file.progress)) {
    const own = byDevice[device];
    if (own === undefined) {
      progress[child] = byDevice;
      continue;
    }
    const deleted = file.children[child]?.v.deleted === true;
    const next = deleted ? (isEmpty(own) ? own : { ...emptyProgress(), seq: own.seq + 1 }) : compactProgress(own, today);
    if (next !== own) changed = true;
    progress[child] = next === own ? byDevice : { ...byDevice, [device]: next };
  }
  return changed ? { ...file, progress } : file;
}
