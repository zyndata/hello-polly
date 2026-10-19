/**
 * Compaction (PLAN.md "Sync model"): attempt days older than 120 days fold into one `"old"`
 * bucket per word, which keeps the family file small for years. Only the device that owns a
 * progress subtree compacts it, and it bumps `seq`, so the compacted copy wins the merge like
 * any other change (STATE.md decision 16).
 */

import { OLD_BUCKET, type AttemptDay, type Day, type DeviceProgress } from '../types';
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
