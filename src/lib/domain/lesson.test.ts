import { describe, expect, it } from 'vitest';
import type { WordPlan } from '../types';
import { defaultPlan } from './family';
import type { WordState } from './learning';
import { MAX_STEPS, composeLesson, newWordCount, reviewChoices, type LessonStep } from './lesson';

const TODAY = '2026-10-18';
const due = (box: number, day = '2026-10-10'): WordState => ({ status: 'learned', firstTries: 5, box, due: day });
const practising = (firstTries: number): WordState => ({ status: 'practising', firstTries });
const words = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}.${i + 1}`);
const plan = (p: Partial<WordPlan> = {}): WordPlan => ({ ...defaultPlan(), ...p });
const count = (steps: LessonStep[], reason: string) => steps.filter((s) => s.kind === 'pick' && s.reason === reason).length;

describe('composeLesson', () => {
  it.each([
    [0, 3], [3, 3], [4, 2], [7, 2], [8, 1], [11, 1], [12, 0], [40, 0]
  ])('%i reviews due → %i new words', (dueCount, expected) => {
    expect(newWordCount(dueCount)).toBe(expected);
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

  it('five reviews due: two new words, all five reviews, most overdue first', () => {
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
    expect(reviews.map((s) => (s.kind === 'pick' ? s.choices : 0))).toEqual([2, 4, 3, 2, 2]);
    expect(steps).toHaveLength(2 + 4 + 5);
  });

  it('many reviews due: no new words, capped at 12 steps', () => {
    const states = new Map(words('r', 30).map((w) => [w, due(2)] as const));
    const steps = composeLesson({ plan: plan(), states, candidates: words('new', 3), today: TODAY });
    expect(steps).toHaveLength(MAX_STEPS);
    expect(steps.every((s) => s.kind === 'pick' && s.reason === 'review')).toBe(true);
  });

  it('a short lesson is topped up to 8 with the least practised words', () => {
    const states = new Map<string, WordState>([
      ['p.well', practising(2)],
      ['p.barely', practising(0)],
      ['p.seen', { status: 'introduced', firstTries: 0 }],
      ['p.some', practising(1)],
      ['p.most', practising(2)],
      ['p.extra', practising(2)]
    ]);
    const steps = composeLesson({ plan: plan(), states, candidates: ['new.1'], today: TODAY });
    expect(steps).toHaveLength(8);
    expect(count(steps, 'new')).toBe(2);
    expect(steps.filter((s) => s.kind === 'pick' && s.reason === 'practice').map((s) => s.word)).toEqual([
      'p.barely',
      'p.seen',
      'p.some',
      'p.extra',
      'p.most'
    ]);
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
