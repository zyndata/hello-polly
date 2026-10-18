/** Defaults and empty values of the family file. */

import { CONTENT_VERSION } from '../content';
import {
  FAMILY_SCHEMA,
  type ChildLimits,
  type DeviceProgress,
  type FamilyFile,
  type FamilySettings,
  type WordPlan
} from '../types';
import { DEFAULT_STAMP, lww } from './lww';

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
