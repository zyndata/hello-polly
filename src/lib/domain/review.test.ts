import { describe, expect, it } from 'vitest';
import type { DeviceProgress, WordPlan } from '../types';
import { defaultPlan, emptyProgress } from './family';
import { wordStates, type WordState } from './learning';
import { REVIEW_WORDS, composeReview, reviewable } from './review';

const plan = (p: Partial<WordPlan> = {}): WordPlan => ({ ...defaultPlan(), ...p });
const met = (ids: string[], state: WordState = { status: 'practising', firstTries: 1 }) => new Map(ids.map((id) => [id, state] as const));
const progress = (attempts: DeviceProgress['attempts']) => ({ d: { ...emptyProgress(), seq: 1, attempts } });
const words = (n: number) => Array.from({ length: n }, (_, i) => `w.${String(i + 1).padStart(2, '0')}`);
const all = () => true;

describe('reviewable', () => {
  it('words met before, not paused, not known, still in the content', () => {
    const states = new Map<string, WordState>([
      ['a', { status: 'new', firstTries: 0 }],
      ['b', { status: 'introduced', firstTries: 0 }],
      ['c', { status: 'learned', firstTries: 4, box: 2 }],
      ['d', { status: 'practising', firstTries: 1 }],
      ['e', { status: 'practising', firstTries: 1 }],
      ['gone', { status: 'practising', firstTries: 1 }]
    ]);
    expect(reviewable({ plan: plan({ paused: ['d'], known: ['e'] }), states, exists: (id) => id !== 'gone' })).toEqual(['b', 'c']);
  });
});

describe('composeReview', () => {
  it('too few words met: no review', () => {
    expect(composeReview({ plan: plan(), states: met(['a', 'b']), progress: undefined, exists: all, seed: 's' })).toEqual([]);
  });

  it('no trouble: six words drawn at random, each once', () => {
    const steps = composeReview({ plan: plan(), states: met(words(20)), progress: undefined, exists: all, seed: 's' });
    expect(steps).toHaveLength(REVIEW_WORDS);
    expect(new Set(steps.map((s) => s.word)).size).toBe(REVIEW_WORDS);
    expect(steps.every((s) => s.kind === 'pick' && s.reason === 'review')).toBe(true);
    const other = composeReview({ plan: plan(), states: met(words(20)), progress: undefined, exists: all, seed: 't' });
    expect(other.map((s) => s.word)).not.toEqual(steps.map((s) => s.word));
  });

  it('trouble words come first and are asked twice, never twice in a row', () => {
    const p = progress({
      'w.03': { '2026-11-01': { c: 2, w: 3, first: 0 } },
      'w.07': { '2026-11-01': { c: 1, w: 1, first: 0 } },
      'w.09': { '2026-11-01': { c: 2, w: 0, first: 2 } }
    });
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      const steps = composeReview({ plan: plan(), states: met(words(20)), progress: p, exists: all, seed });
      const asked = steps.map((s) => s.word);
      expect(asked.filter((w) => w === 'w.03')).toHaveLength(2);
      expect(asked.filter((w) => w === 'w.07')).toHaveLength(2);
      expect(asked).toHaveLength(REVIEW_WORDS + 2);
      expect(new Set(asked).size).toBe(REVIEW_WORDS);
      for (let i = 1; i < asked.length; i++) expect(asked[i]).not.toBe(asked[i - 1]);
    }
  });

  it('a word answered cleanly since is no longer a trouble word', () => {
    const attempts = { 'w.03': { '2026-11-01': { c: 1, w: 1, first: 0 }, '2026-11-02': { c: 2, w: 0, first: 2 } } };
    const steps = composeReview({ plan: plan(), states: met(words(3)), progress: progress(attempts), exists: all, seed: 's' });
    expect(steps).toHaveLength(3);
  });

  it('pictures follow how well the word is known', () => {
    const p = progress({ x: { '2026-11-01': { c: 1, w: 0, first: 1 } } });
    const states = new Map<string, WordState>([
      ['x', { status: 'introduced', firstTries: 0 }],
      ['y', { status: 'practising', firstTries: 2 }],
      ['z', { status: 'learned', firstTries: 6, box: 5 }]
    ]);
    const steps = composeReview({ plan: plan(), states, progress: p, exists: all, seed: 's' });
    const choices = Object.fromEntries(steps.map((s) => [s.word, s.kind === 'pick' ? s.choices : 0]));
    expect(choices).toEqual({ x: 2, y: 3, z: 4 });
  });

  it('works from the attempts a lesson records', () => {
    const p = progress({ 'w.01': { '2026-11-01': { c: 2, w: 0, first: 2 } }, 'w.02': { '2026-11-01': { c: 1, w: 0, first: 1 } }, 'w.03': { '2026-11-01': { c: 1, w: 0, first: 1 } } });
    const steps = composeReview({ plan: plan(), states: wordStates(p), progress: p, exists: all, seed: 's' });
    expect(steps.map((s) => s.word).sort()).toEqual(['w.01', 'w.02', 'w.03']);
  });
});
