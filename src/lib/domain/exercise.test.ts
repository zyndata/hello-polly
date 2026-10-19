import { describe, expect, it } from 'vitest';
import { topics, words } from '../content';
import type { WordId } from '../types';
import { defaultPlan } from './family';
import { HINT_AFTER_MISSES, pickChoices, planLesson, planListenGame, react, starsFor, streakBonus, type PlayStep } from './exercise';
import { nextWords, type WordState } from './learning';
import { composeLesson, introducedBy } from './lesson';
import { mulberry32 } from './random';

const TODAY = '2026-10-19';
const byId = new Map(words.map((w) => [w.id, w]));
const lookup = (id: WordId) => byId.get(id);
const spokenOf = (id: WordId) => {
  const w = byId.get(id);
  return (w?.say ?? w?.en ?? '').toLowerCase();
};
const picks = (steps: PlayStep[]) => steps.flatMap((s) => (s.kind === 'pick' ? [s] : []));

/** Random word states over the real content: some met, some learned in every box, some due. */
function randomStates(seed: number): Map<WordId, WordState> {
  const next = mulberry32(seed);
  const states = new Map<WordId, WordState>();
  for (const w of words) {
    const r = next();
    if (r < 0.4) continue;
    if (r < 0.55) states.set(w.id, { status: 'introduced', firstTries: 0 });
    else if (r < 0.7) states.set(w.id, { status: 'practising', firstTries: 1 + Math.floor(next() * 2) });
    else {
      const box = 1 + Math.floor(next() * 6);
      const due = next() < 0.5 ? '2026-10-10' : '2026-11-30';
      states.set(w.id, { status: 'learned', firstTries: 3 + box, box, due });
    }
  }
  return states;
}

describe('pickChoices', () => {
  it('offers the target and distinct distractors, tier by tier, fixed by the seed', () => {
    const tiers = [['fruit.pear'], ['colours.red', 'colours.blue']];
    const a = pickChoices('fruit.apple', 3, tiers, 's', lookup);
    expect(a).toHaveLength(3);
    expect(a).toContain('fruit.apple');
    expect(a).toContain('fruit.pear');
    expect(new Set(a).size).toBe(3);
    expect(pickChoices('fruit.apple', 3, tiers, 's', lookup)).toEqual(a);
    const orders = new Set(Array.from({ length: 20 }, (_, i) => pickChoices('fruit.apple', 3, tiers, `s${i}`, lookup).indexOf('fruit.apple')));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('never offers a word that sounds like the target', () => {
    for (let i = 0; i < 50; i++) {
      const c = pickChoices('fruit.orange', 4, [['colours.orange', 'colours.red', 'fruit.pear', 'fruit.apple', 'colours.blue']], `o${i}`, lookup);
      expect(c).not.toContain('colours.orange');
      expect(c).toHaveLength(4);
    }
  });

  it('offers fewer pictures only when no word is left', () => {
    expect(pickChoices('fruit.apple', 4, [['fruit.pear']], 's', lookup)).toHaveLength(2);
    expect(pickChoices('nope', 2, [['fruit.pear']], 's', lookup)).toEqual([]);
  });
});

describe('planLesson', () => {
  it('keeps every new word in 2-choice steps, over 300 random histories', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const states = randomStates(seed);
      const plan = { ...defaultPlan(), paused: seed % 3 === 0 ? ['fruit.pear', 'colours.green'] : [] };
      const steps = composeLesson({ plan, states, candidates: nextWords(plan, states, topics, `c${seed}`), today: TODAY });
      const fresh = new Set(introducedBy(steps));
      const played = planLesson(steps, { plan, states, words }, `lesson-${seed}`);
      expect(played.map((s) => [s.kind, s.word])).toEqual(steps.map((s) => [s.kind, s.word]));
      for (const [i, step] of played.entries()) {
        if (step.kind !== 'pick') continue;
        const composed = steps[i];
        expect(step.choices).toHaveLength(composed?.kind === 'pick' ? composed.choices : -1);
        expect(step.choices).toContain(step.word);
        expect(new Set(step.choices).size).toBe(step.choices.length);
        expect(new Set(step.choices.map(spokenOf)).size).toBe(step.choices.length);
        for (const id of step.choices) expect(plan.paused).not.toContain(id);
        if (step.choices.some((id) => fresh.has(id))) expect(step.choices).toHaveLength(2);
        if (fresh.has(step.word)) expect(step.reason).toBe('new');
      }
    }
  });

  it("pairs a new word with the lesson's other new words first", () => {
    const plan = defaultPlan();
    const states = new Map<WordId, WordState>();
    const steps = composeLesson({ plan, states, candidates: nextWords(plan, states, topics, 'c'), today: TODAY });
    expect(introducedBy(steps)).toEqual(['colours.red', 'colours.blue', 'colours.yellow']);
    for (const p of picks(planLesson(steps, { plan, states, words }, 'x'))) {
      expect(p.choices).toHaveLength(2);
      for (const id of p.choices) expect(introducedBy(steps)).toContain(id);
    }
  });
});

describe('planListenGame', () => {
  it('asks learned words only, with pictures by box', () => {
    const states = new Map<WordId, WordState>([
      ['fruit.apple', { status: 'learned', firstTries: 3, box: 1 }],
      ['fruit.pear', { status: 'learned', firstTries: 5, box: 3 }],
      ['fruit.banana', { status: 'learned', firstTries: 6, box: 5 }],
      ['fruit.lemon', { status: 'learned', firstTries: 6, box: 6 }],
      ['colours.red', { status: 'practising', firstTries: 1 }]
    ]);
    const learned = ['fruit.apple', 'fruit.pear', 'fruit.banana', 'fruit.lemon'];
    const steps = picks(planListenGame(learned, { plan: defaultPlan(), states, words }, 'g'));
    expect(steps).toHaveLength(5);
    expect(new Set(steps.slice(0, 4).map((s) => s.word))).toEqual(new Set(learned));
    for (const s of steps) {
      expect(learned).toContain(s.word);
      const box = states.get(s.word)?.box ?? 1;
      expect(s.choices).toHaveLength(box <= 2 ? 2 : box <= 4 ? 3 : 4);
      for (const id of s.choices) expect([...learned, 'colours.red']).toContain(id);
    }
    expect(planListenGame([], { plan: defaultPlan(), states, words }, 'g')).toEqual([]);
  });
});

describe('feedback and stars', () => {
  it('retries once, then glows on every further miss', () => {
    expect(react(0, true)).toBe('correct');
    expect(react(0, false)).toBe('retry');
    expect(react(1, false)).toBe('hint');
    expect(react(5, false)).toBe('hint');
    expect(react(5, true)).toBe('correct');
    expect(HINT_AFTER_MISSES).toBe(2);
  });

  it('gives one bonus star per three first tries in a row', () => {
    expect(streakBonus([])).toBe(0);
    expect(streakBonus([true, true])).toBe(0);
    expect(streakBonus([true, true, true])).toBe(1);
    expect(streakBonus([true, true, true, true, true, true, true])).toBe(2);
    expect(streakBonus([true, true, false, true, true, true, false, true])).toBe(1);
    expect(starsFor(9, [true, true, true, true, true, true])).toBe(11);
  });
});
