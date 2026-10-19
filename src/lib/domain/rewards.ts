/**
 * Stars, chests, the album and minutes, all derived from every device's progress for one
 * child (PLAN.md "Derived, never stored").
 */

import type { Day, DeviceId, DeviceProgress } from '../types';

type ChildProgress = Record<DeviceId, DeviceProgress> | undefined;

const devices = (progress: ChildProgress) => Object.values(progress ?? {});

export function totalStars(progress: ChildProgress): number {
  return devices(progress).reduce((sum, d) => sum + d.stars, 0);
}

export function chestsOpened(progress: ChildProgress): number {
  return devices(progress).reduce((sum, d) => sum + Object.keys(d.chestsOpened).length, 0);
}

export interface ChestState {
  /** Chests earned and not opened yet. Never negative, even if `starsPerChest` was lowered. */
  unopened: number;
  /** Stars toward the next chest, 0 ≤ n < starsPerChest: what the meter shows. */
  meter: number;
}

export function chestState(progress: ChildProgress, starsPerChest: number): ChestState {
  const per = Math.max(1, Math.floor(starsPerChest));
  const stars = totalStars(progress);
  const earned = Math.floor(stars / per);
  return { unopened: Math.max(0, earned - chestsOpened(progress)), meter: stars - earned * per };
}

/** Every sticker id the child owns: the union of all openings on all devices. */
export function album(progress: ChildProgress): Set<string> {
  const owned = new Set<string>();
  for (const d of devices(progress)) {
    for (const opening of Object.values(d.chestsOpened)) for (const s of opening.stickers) owned.add(s);
  }
  return owned;
}

/** Minutes played on `day`, summed across devices. */
export function minutesOn(progress: ChildProgress, day: Day): number {
  return devices(progress).reduce((sum, d) => sum + (d.minutes[day] ?? 0), 0);
}
