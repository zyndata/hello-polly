import { describe, expect, it } from 'vitest';
import type { WordPlan } from '../types';
import { defaultPlan } from './family';
import type { WordState } from './learning';
import { BACKLOG, MAX_STEPS, composeLesson, composePlanned, newWordCount, reviewChoices, type LessonStep } from './lesson';

const TODAY = '2026-10-18';
const due = (box: number, day = '2026-10-10'): WordState => ({ status: 'learned', firstTries: 5, box, due: day });
const practising = (firstTries: number): WordState => ({ status: 'practising', firstTries });
const words = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}.${i + 1}`);
const plan = (p: Partial<WordPlan> = {}): WordPlan => ({ ...defaultPlan(), ...p });
const count = (steps: LessonStep[], reason: string) => steps.filter((s) => s.kind === 'pick' && s.reason === reason).length;
const choicesOf = (steps: LessonStep[]) => steps.map((s) => (s.kind === 'pick' ? s.choices : 0));

describe('composeLesson', () => {
  it.each([
    [0, 3], [3, 3], [4, 2], [7, 2], [8, 1], [11, 1], [12, 0], [40, 0]
  ])('%i reviews due → %i new words', (dueCount, expected) => {
    expect(newWordCount(dueCount)).toBe(expected);
  });

  it('many words still being practised: one new word fewer', () => {
    expect(newWordCount(0, BACKLOG - 1)).toBe(3);
    expect(newWordCount(0, BACKLOG)).toBe(2);
    expect(newWordCount(4, BACKLOG)).toBe(1);
    expect(newWordCount(12, BACKLOG)).toBe(0);
  });

  it.each([[1, 2], [2, 2], [3, 3], [4, 3], [5, 4], [6, 4]])('a review in box %i offers %i pictures', (box, n) => {
    expect(reviewChoices(box)).toBe(n);
  });

  it('a first lesson: three look-and-listen steps, then two 2-choice picks per new word', () => {
    const steps = composeLesson({ plan: plan(), states: new Map(), candidates: words('new', 5), today: TODAY });
    expect(steps.slice(0, 3)).toEqual([
      { kind: 'introduce', word: 'new.1' },
      { kind: 'introduce', word: 'new.2' },
      { kind: 'introduce', word: 'new.3' }
    ]);
    expect(steps.slice(3).every((s) => s.kind === 'pick' && s.choices === 2 && s.reason === 'new')).toBe(true);
    expect(steps).toHaveLength(9);
  });

  it('new words never appear twice in a row while there is anything to put between them', () => {
    const states = new Map(words('old', 6).map((w) => [w, due(3)] as const));
    const steps = composeLesson({ plan: plan(), states, candidates: words('new', 3), today: TODAY });
    const practice = steps.filter((s) => s.kind === 'pick').map((s) => s.word);
    for (let i = 1; i < practice.length; i++) expect(practice[i]).not.toBe(practice[i - 1]);
  });

  it('five reviews due: two new words, all five reviews, most overdue first, then a learned word', () => {
    const states = new Map<string, WordState>([
      ['r.a', due(1, '2026-10-17')],
      ['r.b', due(5, '2026-09-01')],
      ['r.c', due(3, '2026-10-01')],
      ['r.d', due(2, '2026-10-18')],
      ['r.e', { status: 'learned', firstTries: 9, box: 1 }], // learned in the compacted past
      ['r.later', due(4, '2026-10-30')]
    ]);
    const steps = composeLesson({ plan: plan(), states, candidates: words('new', 3), today: TODAY });
    expect(steps.filter((s) => s.kind === 'introduce')).toHaveLength(2);
    const reviews = steps.filter((s) => s.kind === 'pick' && s.reason === 'review');
    expect(reviews.map((s) => s.word)).toEqual(['r.e', 'r.b', 'r.c', 'r.a', 'r.d']);
    expect(choicesOf(reviews)).toEqual([2, 4, 3, 2, 2]);
    expect(steps.filter((s) => s.kind === 'pick' && s.reason === 'practice').map((s) => s.word)).toEqual(['r.later']);
    expect(steps).toHaveLength(MAX_STEPS);
  });

  it('many reviews due: no new words, capped at 12 steps', () => {
    const states = new Map(words('r', 30).map((w) => [w, due(2)] as const));
    const steps = composeLesson({ plan: plan(), states, candidates: words('new', 3), today: TODAY });
    expect(steps).toHaveLength(MAX_STEPS);
    expect(steps.every((s) => s.kind === 'pick' && s.reason === 'review')).toBe(true);
  });

  it('the rest of the lesson practises words met before: not seen today and least practised first', () => {
    const states = new Map<string, WordState>([
      ['p.well', practising(2)],
      ['p.barely', practising(0)],
      ['p.seen', { status: 'introduced', firstTries: 0 }],
      ['p.some', practising(1)],
      ['p.most', practising(2)],
      ['p.today', practising(0)],
      ['p.extra', practising(2)]
    ]);
    const steps = composeLesson({ plan: plan(), states, candidates: ['new.1'], today: TODAY, practisedToday: new Set(['p.today']) });
    expect(count(steps, 'new')).toBe(2);
    const practice = steps.filter((s) => s.kind === 'pick' && s.reason === 'practice');
    expect(practice.map((s) => s.word)).toEqual(['p.barely', 'p.seen', 'p.some', 'p.extra', 'p.most', 'p.well', 'p.today']);
    // Nearly learned (two first tries): three pictures.
    expect(choicesOf(practice)).toEqual([2, 2, 2, 3, 3, 3, 2]);
    expect(steps).toHaveLength(1 + 2 + 7);
  });

  it('three new words still leave room for three words met before (decision 104)', () => {
    const states = new Map(words('p', 5).map((w) => [w, practising(1)] as const));
    const steps = composeLesson({ plan: plan(), states, candidates: words('new', 3), today: TODAY });
    expect(steps).toHaveLength(MAX_STEPS);
    expect(count(steps, 'new')).toBe(6);
    expect(count(steps, 'practice')).toBe(3);
    expect(new Set(steps.map((s) => s.word)).size).toBe(6);
  });

  it('a long backlog: two new words and six words met before', () => {
    const states = new Map(words('p', 20).map((w) => [w, practising(2)] as const));
    const steps = composeLesson({ plan: plan(), states, candidates: words('new', 3), today: TODAY });
    expect(steps.filter((s) => s.kind === 'introduce')).toHaveLength(2);
    expect(count(steps, 'practice')).toBe(6);
    expect(steps).toHaveLength(MAX_STEPS);
  });

  it('learned words that are not due fill a lesson with nothing else to do, lowest box first', () => {
    const states = new Map<string, WordState>([
      ['l.high', due(5, '2026-11-30')],
      ['l.low', due(2, '2026-10-20')]
    ]);
    const steps = composeLesson({ plan: plan(), states, candidates: [], today: TODAY });
    expect(steps.map((s) => s.word)).toEqual(['l.low', 'l.high']);
    expect(choicesOf(steps)).toEqual([2, 4]);
  });

  it('paused and known words are neither reviewed nor practised', () => {
    const states = new Map<string, WordState>([
      ['r.paused', due(2)],
      ['r.known', due(2)],
      ['p.paused', practising(0)],
      ['r.ok', due(2)]
    ]);
    const steps = composeLesson({
      plan: plan({ paused: ['r.paused', 'p.paused'], known: ['r.known'] }),
      states,
      candidates: [],
      today: TODAY
    });
    expect(steps.map((s) => s.word)).toEqual(['r.ok']);
  });

  it('nothing to teach: an empty lesson', () => {
    expect(composeLesson({ plan: plan(), states: new Map(), candidates: [], today: TODAY })).toEqual([]);
  });
});

describe('composePlanned', () => {
  it('new words: look and listen, then two 2-choice picks each; four of them fill the lesson', () => {
    const steps = composePlanned({ plan: plan(), states: new Map(), today: TODAY }, words('new', 4));
    expect(steps.filter((s) => s.kind === 'introduce').map((s) => s.word)).toEqual(words('new', 4));
    expect(count(steps, 'new')).toBe(8);
    expect(steps).toHaveLength(MAX_STEPS);
  });

  it('words met before are picked twice each, and the lesson is topped up to eight with other words', () => {
    const states = new Map<string, WordState>([
      ['m.learned', due(3, '2026-10-30')],
      ['m.practising', practising(1)],
      ['o.due', due(1, '2026-10-01')],
      ['o.p', practising(0)],
      ['o.q', practising(2)]
    ]);
    const chosen = ['m.learned', 'new.1', 'm.practising'];
    const steps = composePlanned({ plan: plan(), states, today: TODAY }, chosen);
    expect(steps[0]).toEqual({ kind: 'introduce', word: 'new.1' });
    expect(steps.filter((s) => s.kind === 'pick' && chosen.includes(s.word))).toHaveLength(6);
    expect(steps).toHaveLength(8);
    // The top-up: the due review first.
    expect(steps.filter((s) => s.word.startsWith('o.')).map((s) => s.word)).toEqual(['o.due']);
    expect(steps.find((s) => s.word === 'm.learned')).toMatchObject({ reason: 'practice', choices: 3 });
  });

  it('a planned word that is due is a review', () => {
    const states = new Map<string, WordState>([['m.due', due(5)]]);
    const steps = composePlanned({ plan: plan(), states, today: TODAY }, ['m.due']);
    expect(steps).toEqual([
      { kind: 'pick', word: 'm.due', choices: 4, reason: 'review' },
      { kind: 'pick', word: 'm.due', choices: 4, reason: 'review' }
    ]);
  });

  it('keeps at most four words, each once', () => {
    const steps = composePlanned({ plan: plan(), states: new Map(), today: TODAY }, ['a', 'b', 'a', 'c', 'd', 'e']);
    expect(steps.filter((s) => s.kind === 'introduce').map((s) => s.word)).toEqual(['a', 'b', 'c', 'd']);
  });
});
