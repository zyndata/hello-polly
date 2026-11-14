import { describe, expect, it } from 'vitest';
import { topics } from '../content';
import { addChild } from './children';
import { emptyFamily, defaultPlan } from './family';
import { wordStates } from './learning';
import { introducedBy, lessonFor, nextLesson } from './lesson';
import { mergeFamily } from './merge';
import { totalStars } from './rewards';
import { addStars, lessonsDone, plannedDone, recordAttempt, recordIntroduced, recordLesson } from './progress';

const T1 = '2026-10-19T08:00:00.000Z';
const T2 = '2026-10-19T09:00:00.000Z';
const TODAY = '2026-10-19';

const family = () => addChild(emptyFamily('f'), 'c1', { name: 'Ola', avatar: 'fox' }, T1, 'dev-a');

describe('progress', () => {
  it('records a word as introduced once, bumping seq only when it changes', () => {
    const once = recordIntroduced(family(), 'c1', 'dev-a', 'fruit.apple', T1);
    expect(once.progress.c1?.['dev-a']?.introduced).toEqual({ 'fruit.apple': T1 });
    expect(once.progress.c1?.['dev-a']?.seq).toBe(1);
    expect(recordIntroduced(once, 'c1', 'dev-a', 'fruit.apple', T2)).toBe(once);
    expect(wordStates(once.progress.c1).get('fruit.apple')?.status).toBe('introduced');
  });

  it('records lessons per device and counts them across devices after a merge', () => {
    const lesson = { at: T1, words: ['colours.red'] };
    const a = recordLesson(family(), 'c1', 'dev-a', 'l1', lesson);
    expect(recordLesson(a, 'c1', 'dev-a', 'l1', lesson)).toBe(a);
    const b = recordLesson(recordLesson(family(), 'c1', 'dev-b', 'l2', lesson), 'c1', 'dev-b', 'l3', lesson);
    expect(lessonsDone(a.progress.c1)).toBe(1);
    expect(lessonsDone(mergeFamily(a, b).progress.c1)).toBe(3);
    expect(lessonsDone(undefined)).toBe(0);
  });

  it('makes the next lesson introduce the following words once these were seen', () => {
    let file = family();
    const first = introducedBy(lessonFor(file, 'c1', topics, TODAY));
    expect(first).toEqual(['colours.red', 'colours.blue', 'colours.yellow']);
    for (const id of first) file = recordIntroduced(file, 'c1', 'dev-a', id, T1);
    expect(introducedBy(lessonFor(file, 'c1', topics, TODAY))).toEqual(['colours.green', 'colours.orange', 'colours.purple']);
  });

  it('introduces a queued word first', () => {
    let file = family();
    file = { ...file, plans: { ...file.plans, c1: { v: { ...defaultPlan(), queue: ['pets-farm.duck'] }, t: T2, d: 'dev-a' } } };
    expect(introducedBy(lessonFor(file, 'c1', topics, TODAY))[0]).toBe('pets-farm.duck');
  });

  it('plays the parent’s planned lessons in order until a device records each one finished (decision 105)', () => {
    let file = family();
    const lessons = [
      { id: 'p1', words: ['body.nose', 'fruit.apple'] },
      { id: 'p2', words: ['pets-farm.cat'] }
    ];
    file = { ...file, plans: { ...file.plans, c1: { v: { ...defaultPlan(), lessons }, t: T2, d: 'dev-a' } } };
    const first = nextLesson(file, 'c1', topics, TODAY);
    expect(first.planned).toBe('p1');
    expect(introducedBy(first.steps)).toEqual(['body.nose', 'fruit.apple']);

    file = recordLesson(file, 'c1', 'dev-b', 'l1', { at: T2, words: ['body.nose', 'fruit.apple'], planned: 'p1' });
    expect(file.progress.c1?.['dev-b']?.lessons.l1?.planned).toBe('p1');
    expect([...plannedDone(file.progress.c1)]).toEqual(['p1']);
    const second = nextLesson(file, 'c1', topics, TODAY);
    expect(second.planned).toBe('p2');
    expect(introducedBy(second.steps)).toEqual(['pets-farm.cat']);
    // A one-word lesson is still topped up to eight steps.
    expect(second.steps.length).toBeLessThanOrEqual(8);

    file = recordLesson(file, 'c1', 'dev-a', 'l2', { at: T2, words: ['pets-farm.cat'], planned: 'p2' });
    const after = nextLesson(file, 'c1', topics, TODAY);
    expect(after.planned).toBeUndefined();
    expect(introducedBy(after.steps)[0]).toBe('colours.red');
  });

  it('a planned lesson of words the content no longer has is skipped', () => {
    let file = family();
    file = { ...file, plans: { ...file.plans, c1: { v: { ...defaultPlan(), lessons: [{ id: 'p1', words: ['gone.word'] }] }, t: T2, d: 'dev-a' } } };
    expect(nextLesson(file, 'c1', topics, TODAY).planned).toBeUndefined();
  });

  it('words introduced earlier come back in later lessons, so they can be learned on a second day (decision 104)', () => {
    let file = family();
    for (const id of ['colours.red', 'colours.blue', 'colours.yellow']) {
      file = recordIntroduced(file, 'c1', 'dev-a', id, T1);
      file = recordAttempt(file, 'c1', 'dev-a', id, '2026-10-18', 0);
      file = recordAttempt(file, 'c1', 'dev-a', id, '2026-10-18', 0);
    }
    const steps = lessonFor(file, 'c1', topics, TODAY);
    expect(steps.filter((s) => s.kind === 'pick' && s.reason === 'practice').map((s) => s.word).sort()).toEqual([
      'colours.blue',
      'colours.red',
      'colours.yellow'
    ]);
    // One first-try answer today makes such a word learned.
    file = recordAttempt(file, 'c1', 'dev-a', 'colours.red', TODAY, 0);
    expect(wordStates(file.progress.c1).get('colours.red')?.status).toBe('learned');
  });

  it('records solved exercises per word and day, with first tries and wrong taps', () => {
    let file = family();
    file = recordAttempt(file, 'c1', 'dev-a', 'fruit.apple', TODAY, 0);
    file = recordAttempt(file, 'c1', 'dev-a', 'fruit.apple', TODAY, 2);
    file = recordAttempt(file, 'c1', 'dev-a', 'fruit.apple', '2026-10-20', 0);
    file = recordAttempt(file, 'c1', 'dev-a', 'fruit.pear', TODAY, 1);
    const p = file.progress.c1?.['dev-a'];
    expect(p?.attempts).toEqual({
      'fruit.apple': { [TODAY]: { c: 2, w: 2, first: 1 }, '2026-10-20': { c: 1, w: 0, first: 1 } },
      'fruit.pear': { [TODAY]: { c: 1, w: 1, first: 0 } }
    });
    expect(p?.seq).toBe(4);
    // Two first tries on two days: still practising, one more makes it learned.
    expect(wordStates(file.progress.c1).get('fruit.apple')?.status).toBe('practising');
    file = recordAttempt(file, 'c1', 'dev-a', 'fruit.apple', '2026-10-20', 0);
    expect(wordStates(file.progress.c1).get('fruit.apple')).toMatchObject({ status: 'learned', box: 1, due: '2026-10-21' });
  });

  it('adds stars on this device only, never taking any away', () => {
    let file = addStars(family(), 'c1', 'dev-a', 12);
    file = addStars(file, 'c1', 'dev-b', 3);
    expect(addStars(file, 'c1', 'dev-a', 0)).toBe(file);
    expect(addStars(file, 'c1', 'dev-a', -5)).toBe(file);
    expect(file.progress.c1?.['dev-a']?.stars).toBe(12);
    expect(totalStars(file.progress.c1)).toBe(15);
  });
});

describe('minutes', () => {
  it('adds whole minutes to the day on this device, bumping seq; nothing for none', async () => {
    const { addMinutes } = await import('./progress');
    const { emptyFamily } = await import('./family');
    let file = emptyFamily('f');
    file = addMinutes(file, 'c', 'dev', '2026-10-20', 2);
    file = addMinutes(file, 'c', 'dev', '2026-10-20', 1.9);
    file = addMinutes(file, 'c', 'dev', '2026-10-21', 3);
    expect(file.progress.c?.dev?.minutes).toEqual({ '2026-10-20': 3, '2026-10-21': 3 });
    expect(file.progress.c?.dev?.seq).toBe(3);
    expect(addMinutes(file, 'c', 'dev', '2026-10-21', 0.5)).toBe(file);
  });
});
