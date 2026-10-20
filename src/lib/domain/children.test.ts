import { describe, expect, it } from 'vitest';
import { addChild, childPlan, cleanBirthYear, cleanName, deleteChild, liveChild, liveChildren, setPlan, updateChild } from './children';
import { defaultLimits, defaultPlan, emptyFamily } from './family';
import { nextStamp } from './lww';
import { mergeFamily } from './merge';

const T1 = '2026-10-19T08:00:00.000Z';
const T2 = '2026-10-19T09:00:00.000Z';
const T3 = '2026-10-19T10:00:00.000Z';

describe('children', () => {
  it('adds a child with its profile, the default plan and the default limits', () => {
    const file = addChild(emptyFamily('f'), 'c1', { name: '  Ola  ', avatar: 'fox', birthYear: 2022 }, T1, 'dev-a');
    expect(file.children.c1).toEqual({ v: { name: 'Ola', avatar: 'fox', birthYear: 2022 }, t: T1, d: 'dev-a' });
    expect(file.plans.c1).toEqual({ v: defaultPlan(), t: T1, d: 'dev-a' });
    expect(file.limits.c1).toEqual({ v: defaultLimits(), t: T1, d: 'dev-a' });
    expect(liveChildren(file)).toEqual([{ id: 'c1', profile: { name: 'Ola', avatar: 'fox', birthYear: 2022 } }]);
  });

  it('takes a starting plan, and never overwrites a child that exists', () => {
    const plan = { ...defaultPlan(), queue: ['fruit.mango'] };
    const file = addChild(emptyFamily('f'), 'c1', { name: 'Ola', avatar: 'fox' }, T1, 'dev-a', plan);
    expect(childPlan(file, 'c1').queue).toEqual(['fruit.mango']);
    expect(() => addChild(file, 'c1', { name: 'Staś', avatar: 'hippopotamus' }, T2, 'dev-a')).toThrow();
  });

  it('lists live children by name in Polish order, without the deleted ones', () => {
    let file = emptyFamily('f');
    file = addChild(file, 'c1', { name: 'Zosia', avatar: 'fox' }, T1, 'd');
    file = addChild(file, 'c2', { name: 'Łucja', avatar: 'hippopotamus' }, T1, 'd');
    file = addChild(file, 'c3', { name: 'Ala', avatar: 'frog' }, T1, 'd');
    expect(liveChildren(file).map((c) => c.profile.name)).toEqual(['Ala', 'Łucja', 'Zosia']);
    file = deleteChild(file, 'c2', T2, 'd');
    expect(liveChildren(file).map((c) => c.id)).toEqual(['c3', 'c1']);
    expect(liveChild(file, 'c2')).toBeUndefined();
  });

  it('edits a profile with a newer stamp, and leaves a deleted child deleted', () => {
    let file = addChild(emptyFamily('f'), 'c1', { name: 'Ola', avatar: 'fox' }, T1, 'dev-a');
    file = updateChild(file, 'c1', { name: 'Ola K.', avatar: 'koala' }, T2, 'dev-b');
    expect(file.children.c1).toEqual({ v: { name: 'Ola K.', avatar: 'koala' }, t: T2, d: 'dev-b' });
    const deleted = deleteChild(file, 'c1', T3, 'dev-a');
    expect(updateChild(deleted, 'c1', { name: 'Back', avatar: 'fox' }, T3, 'dev-a')).toBe(deleted);
    expect(updateChild(file, 'nobody', { name: 'X', avatar: 'fox' }, T3, 'dev-a')).toBe(file);
  });

  it('deletes with a tombstone that keeps no name and wins a merge against a newer edit', () => {
    const base = addChild(emptyFamily('f'), 'c1', { name: 'Ola', avatar: 'fox' }, T1, 'dev-a');
    const deleted = deleteChild(base, 'c1', T2, 'dev-a');
    expect(deleted.children.c1?.v).toEqual({ name: '', avatar: '', deleted: true });
    expect(deleteChild(deleted, 'c1', T3, 'dev-a')).toBe(deleted);
    // The other phone renamed her later, offline.
    const renamed = updateChild(base, 'c1', { name: 'Ola!', avatar: 'fox' }, T3, 'dev-b');
    expect(liveChildren(mergeFamily(deleted, renamed))).toEqual([]);
    expect(liveChildren(mergeFamily(renamed, deleted))).toEqual([]);
  });

  it('stamps after a register whose clock ran ahead, so the local write still wins', () => {
    const ahead = '2026-12-01T00:00:00.000Z';
    expect(nextStamp(ahead, T1)).toBe('2026-12-01T00:00:00.001Z');
    expect(nextStamp(undefined, T1)).toBe(T1);
    let file = addChild(emptyFamily('f'), 'c1', { name: 'Ola', avatar: 'fox' }, ahead, 'dev-b');
    file = setPlan(file, 'c1', { ...defaultPlan(), randomWithinTopic: true }, T1, 'dev-a');
    expect(file.plans.c1?.t).toBe('2026-12-01T00:00:00.001Z');
    expect(childPlan(file, 'c1').randomWithinTopic).toBe(true);
  });

  it('gives a child with no stored plan the default one', () => {
    expect(childPlan(emptyFamily('f'), 'nobody')).toEqual(defaultPlan());
  });

  it('cleans names and birth years', () => {
    expect(cleanName('  Ola   Maria ')).toBe('Ola Maria');
    expect(cleanName('x'.repeat(40))).toHaveLength(24);
    expect(cleanBirthYear(2022, 2026)).toBe(2022);
    expect(cleanBirthYear(2027, 2026)).toBeUndefined();
    expect(cleanBirthYear(1990, 2026)).toBeUndefined();
    expect(cleanBirthYear(2021.5, 2026)).toBeUndefined();
    expect(cleanBirthYear(undefined, 2026)).toBeUndefined();
  });
});

describe('limits', () => {
  it('a new child has the defaults; a change is an Lww write that beats the older one', async () => {
    const { addChild, childLimits, setLimits } = await import('./children');
    const { emptyFamily } = await import('./family');
    const { mergeFamily } = await import('./merge');
    const base = addChild(emptyFamily('f'), 'c', { name: 'Ola', avatar: 'fox' }, '2026-10-20T10:00:00.000Z', 'a');
    expect(childLimits(base, 'c')).toEqual({ dailyMinutes: 15, sessionMinutes: 10 });
    expect(childLimits(base, 'nobody')).toEqual({ dailyMinutes: 15, sessionMinutes: 10 });
    const phone = setLimits(base, 'c', { dailyMinutes: null, sessionMinutes: 5 }, '2026-10-20T11:00:00.000Z', 'a');
    const tablet = setLimits(base, 'c', { dailyMinutes: 30, sessionMinutes: 20 }, '2026-10-20T10:30:00.000Z', 'b');
    expect(childLimits(mergeFamily(phone, tablet), 'c')).toEqual({ dailyMinutes: null, sessionMinutes: 5 });
    expect(childLimits(mergeFamily(tablet, phone), 'c')).toEqual({ dailyMinutes: null, sessionMinutes: 5 });
  });
});
