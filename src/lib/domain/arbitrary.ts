/**
 * Random family files for the merge property tests (STATE.md decision 14: a seeded generator
 * instead of a property-testing library). Ids, times and days come from small pools, so two
 * generated files overlap often and every tie-break gets exercised. Test-only.
 */

import type { ChildProfile, DeviceProgress, FamilyFile, FamilyMember, Lww } from '../types';
import { compactProgress } from './compaction';
import { DEFAULT_SETTINGS, defaultPlan, emptyFamily } from './family';
import { mulberry32 } from './random';

export const TODAY = '2026-10-18';

const DEVICES = ['dev-a', 'dev-b', 'dev-c'];
const CHILDREN = ['child-1', 'child-2', 'child-3'];
const WORDS = ['fruit.apple', 'fruit.banana', 'colours.red', 'numbers.one'];
const TIMES = ['2026-01-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', '2026-10-18T09:30:00.000Z'];
// Some days are more than 120 days before TODAY, so compaction has work to do.
const DAYS = ['2026-03-01', '2026-05-20', '2026-10-01', '2026-10-17', '2026-10-18'];

export interface Gen {
  int(max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

export function gen(seed: number): Gen {
  const next = mulberry32(seed);
  return {
    int: (max) => Math.floor(next() * max),
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
    chance: (p) => next() < p
  };
}

function stamp<T>(g: Gen, v: T): Lww<T> {
  return { v, t: g.pick(TIMES), d: g.pick(DEVICES) };
}

function progress(g: Gen): DeviceProgress {
  const p: DeviceProgress = {
    seq: g.int(4),
    introduced: {},
    attempts: {},
    stars: g.int(40),
    chestsOpened: {},
    minutes: {},
    storiesHeard: {}
  };
  for (const word of WORDS) {
    if (g.chance(0.5)) p.introduced[word] = g.pick(TIMES);
    if (g.chance(0.6)) {
      const byDay: DeviceProgress['attempts'][string] = {};
      for (const day of DAYS) if (g.chance(0.5)) byDay[day] = { c: 1 + g.int(3), w: g.int(3), first: g.int(2) };
      p.attempts[word] = byDay;
    }
  }
  if (g.chance(0.4)) p.chestsOpened[`chest-${g.int(5)}`] = { at: g.pick(TIMES), stickers: [`s${g.int(6)}`] };
  if (g.chance(0.5)) p.minutes[g.pick(DAYS)] = g.int(20);
  // A compacted copy, as its owner would have written it (seq bumped).
  return g.chance(0.3) ? compactProgress(p, TODAY) : p;
}

function child(g: Gen): ChildProfile {
  const profile: ChildProfile = { name: g.pick(['Ola', 'Staś', 'Zosia']), avatar: g.pick(['cat', 'dog']) };
  if (g.chance(0.3)) profile.deleted = true;
  return profile;
}

/** A random but well-formed family file. */
export function familyFile(g: Gen): FamilyFile {
  const file = emptyFamily(g.pick(['family-x', 'family-y']));
  file.contentVersion = 1 + g.int(2);
  if (g.chance(0.6)) file.settings.accent = stamp(g, g.pick(['en-GB', 'en-US'] as const));
  if (g.chance(0.6)) file.settings.slowRate = stamp(g, g.pick([0.5, 0.6, 0.7]));
  if (g.chance(0.4)) file.settings.starsPerChest = stamp(g, g.pick([10, 15, DEFAULT_SETTINGS.starsPerChest]));

  for (const id of CHILDREN) {
    if (g.chance(0.6)) file.children[id] = stamp(g, child(g));
    if (g.chance(0.5)) file.plans[id] = stamp(g, { ...defaultPlan(), randomWithinTopic: g.chance(0.5) });
    if (g.chance(0.4)) file.limits[id] = stamp(g, { dailyMinutes: g.pick([15, null]), sessionMinutes: 10 });
    if (g.chance(0.7)) {
      const perDevice: Record<string, DeviceProgress> = {};
      for (const device of DEVICES) if (g.chance(0.6)) perDevice[device] = progress(g);
      file.progress[id] = perDevice;
    }
  }
  if (g.chance(0.5)) {
    const members: FamilyMember[] = [];
    for (const email of ['a@example.com', 'b@example.com']) {
      if (g.chance(0.6)) members.push({ email, role: g.pick(['owner', 'writer'] as const) });
    }
    file.members = members;
  }
  return file;
}
