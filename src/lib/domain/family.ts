/** Defaults and empty values of the family file. */

import { CONTENT_VERSION } from '../content';
import {
  FAMILY_SCHEMA,
  type ChildLimits,
  type DeviceId,
  type DeviceProgress,
  type FamilyFile,
  type FamilySettings,
  type Instant,
  type WordPlan
} from '../types';
import { DEFAULT_STAMP, lww, nextStamp } from './lww';

export const DEFAULT_SETTINGS: FamilySettings = {
  accent: 'en-GB',
  slowRate: 0.6,
  normalRate: 0.9,
  slowRepeatTwice: false,
  defaultSpeed: 'slow',
  polishPrompts: true,
  starsPerChest: 15
};

/** First-run starting topics (PLAN.md "First run"). */
export const DEFAULT_TOPICS = ['colours', 'fruit', 'pets-farm', 'numbers'];

export const defaultPlan = (): WordPlan => ({
  enabledTopics: [...DEFAULT_TOPICS],
  queue: [],
  known: [],
  paused: [],
  randomWithinTopic: false
});

export const defaultLimits = (): ChildLimits => ({ dailyMinutes: 15, sessionMinutes: 10 });

export const emptyProgress = (): DeviceProgress => ({
  seq: 0,
  introduced: {},
  attempts: {},
  stars: 0,
  chestsOpened: {},
  lessons: {},
  minutes: {},
  storiesHeard: {}
});

/**
 * A family with no children. Settings carry the default stamp, so two fresh installs hold
 * identical files and any real change beats a default.
 */
export function emptyFamily(familyId: string): FamilyFile {
  const settings = Object.fromEntries(
    Object.entries(DEFAULT_SETTINGS).map(([key, v]) => [key, lww(v, DEFAULT_STAMP.t, DEFAULT_STAMP.d)])
  ) as FamilyFile['settings'];
  return {
    schema: FAMILY_SCHEMA,
    familyId,
    contentVersion: CONTENT_VERSION,
    settings,
    children: {},
    plans: {},
    limits: {},
    progress: {}
  };
}

/** The ranges PLAN.md allows for the two speech rates. */
export const RATE_RANGES = { slowRate: [0.4, 0.8], normalRate: [0.8, 1.1] } as const;

/** A rate inside its range; anything that is not a number becomes the default. */
export function clampRate(key: keyof typeof RATE_RANGES, value: number): number {
  const [min, max] = RATE_RANGES[key];
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS[key];
  return Math.min(max, Math.max(min, value));
}

/** The family's settings as plain values, with the rates kept in range. */
export function readSettings(file: FamilyFile): FamilySettings {
  const values = Object.fromEntries(
    (Object.keys(DEFAULT_SETTINGS) as (keyof FamilySettings)[]).map((key) => [key, file.settings[key]?.v ?? DEFAULT_SETTINGS[key]])
  ) as unknown as FamilySettings;
  values.slowRate = clampRate('slowRate', values.slowRate);
  values.normalRate = clampRate('normalRate', values.normalRate);
  return values;
}

/**
 * The file with one setting changed by this device, stamped by `nextStamp` (STATE.md
 * decision 31).
 */
export function setSetting<K extends keyof FamilySettings>(
  file: FamilyFile,
  key: K,
  value: FamilySettings[K],
  now: Instant,
  device: DeviceId
): FamilyFile {
  const v = (key === 'slowRate' || key === 'normalRate' ? clampRate(key, value as number) : value) as FamilySettings[K];
  return { ...file, settings: { ...file.settings, [key]: lww(v, nextStamp(file.settings[key]?.t, now), device) } };
}
