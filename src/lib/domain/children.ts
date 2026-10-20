/**
 * Children in the family file: add, edit, delete (a tombstone), and their word plans (STATE.md
 * decision 34). Pure functions; the screens write their result through `updateFamily`.
 */

import type { ChildId, ChildLimits, ChildProfile, DeviceId, FamilyFile, Instant, WordPlan } from '../types';
import { defaultLimits, defaultPlan } from './family';
import { lww, nextStamp } from './lww';

export interface ChildEntry {
  id: ChildId;
  profile: ChildProfile;
}

/** A nickname as stored: trimmed, at most this many characters. */
export const MAX_NAME_LENGTH = 24;

export const cleanName = (name: string): string => name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);

/** A birth year that makes sense for a child using the app this year, or `undefined`. */
export function cleanBirthYear(year: number | undefined, thisYear: number): number | undefined {
  return year !== undefined && Number.isInteger(year) && year >= thisYear - 18 && year <= thisYear ? year : undefined;
}

/** The children that are not deleted, by name (Polish collation), then id. */
export function liveChildren(file: FamilyFile): ChildEntry[] {
  return Object.entries(file.children)
    .filter(([, r]) => r.v.deleted !== true)
    .map(([id, r]) => ({ id, profile: r.v }))
    .sort((a, b) => a.profile.name.localeCompare(b.profile.name, 'pl') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function liveChild(file: FamilyFile, id: ChildId): ChildProfile | undefined {
  const profile = file.children[id]?.v;
  return profile && profile.deleted !== true ? profile : undefined;
}

function profileOf(input: Omit<ChildProfile, 'deleted'>): ChildProfile {
  const profile: ChildProfile = { name: cleanName(input.name), avatar: input.avatar };
  if (input.birthYear !== undefined) profile.birthYear = input.birthYear;
  return profile;
}

/** A new child with its profile, the default word plan (or `plan`) and the default limits. */
export function addChild(
  file: FamilyFile,
  id: ChildId,
  input: Omit<ChildProfile, 'deleted'>,
  now: Instant,
  device: DeviceId,
  plan: WordPlan = defaultPlan()
): FamilyFile {
  if (file.children[id]) throw new Error(`Child ${id} already exists`);
  return {
    ...file,
    children: { ...file.children, [id]: lww(profileOf(input), now, device) },
    plans: { ...file.plans, [id]: lww(plan, nextStamp(file.plans[id]?.t, now), device) },
    limits: { ...file.limits, [id]: lww(defaultLimits(), nextStamp(file.limits[id]?.t, now), device) }
  };
}

/** The profile replaced. A deleted child stays deleted. */
export function updateChild(
  file: FamilyFile,
  id: ChildId,
  input: Omit<ChildProfile, 'deleted'>,
  now: Instant,
  device: DeviceId
): FamilyFile {
  const current = file.children[id];
  if (!current || current.v.deleted) return file;
  return { ...file, children: { ...file.children, [id]: lww(profileOf(input), nextStamp(current.t, now), device) } };
}

/** The tombstone: nothing of the profile is kept, and it wins every merge (decision 15). */
export function deleteChild(file: FamilyFile, id: ChildId, now: Instant, device: DeviceId): FamilyFile {
  const current = file.children[id];
  if (!current || current.v.deleted) return file;
  const tombstone: ChildProfile = { name: '', avatar: '', deleted: true };
  return { ...file, children: { ...file.children, [id]: lww(tombstone, nextStamp(current.t, now), device) } };
}

/** The child's word plan, or the default one if none was ever written. */
export function childPlan(file: FamilyFile, id: ChildId): WordPlan {
  return file.plans[id]?.v ?? defaultPlan();
}

export function setPlan(file: FamilyFile, id: ChildId, plan: WordPlan, now: Instant, device: DeviceId): FamilyFile {
  return { ...file, plans: { ...file.plans, [id]: lww(plan, nextStamp(file.plans[id]?.t, now), device) } };
}

/** The child's screen-time limits, or the defaults if none were ever written. */
export function childLimits(file: FamilyFile, id: ChildId): ChildLimits {
  return file.limits[id]?.v ?? defaultLimits();
}

export function setLimits(file: FamilyFile, id: ChildId, limits: ChildLimits, now: Instant, device: DeviceId): FamilyFile {
  const value: ChildLimits = { dailyMinutes: limits.dailyMinutes, sessionMinutes: limits.sessionMinutes };
  return { ...file, limits: { ...file.limits, [id]: lww(value, nextStamp(file.limits[id]?.t, now), device) } };
}
