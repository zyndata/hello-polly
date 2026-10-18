import { describe, expect, it } from 'vitest';
import type { AttemptDay, DeviceProgress, Topic, WordPlan } from '../types';
import { compactProgress } from './compaction';
import { defaultPlan, emptyProgress } from './family';
import { NEW_WORD, deriveWordState, isDue, nextWords, wordStates, type WordState } from './learning';

const W = 'fruit.apple';

/** One device's progress from `[day, c, w, first]` rows for the word W. */
function device(rows: [string, number, number, number][], extra: Partial<DeviceProgress> = {}): DeviceProgress {
  const byDay: Record<string, AttemptDay> = {};
  for (const [day, c, w, first] of rows) byDay[day] = { c, w, first };
  return { ...emptyProgress(), seq: 1, attempts: { [W]: byDay }, ...extra };
}

const stateOf = (...devices: DeviceProgress[]): WordState =>
  wordStates(Object.fromEntries(devices.map((d, i) => [`dev-${i}`, d]))).get(W) ?? NEW_WORD;

describe('word states (fixed histories)', () => {
  it('new: nothing recorded', () => {
    expect(wordStates({}).get(W)).toBeUndefined();
    expect(deriveWordState(undefined, false)).toEqual({ status: 'new', firstTries: 0 });
  });

  it('introduced: seen in look and listen, never exercised', () => {
    expect(stateOf({ ...emptyProgress(), introduced: { [W]: '2026-10-01T10:00:00.000Z' } }).status).toBe('introduced');
  });

  it.each([
    ['three first tries on one day', [['2026-10-01', 3, 0, 3]]],
    ['two first tries on two days', [['2026-10-01', 1, 0, 1], ['2026-10-02', 1, 0, 1]]],
    ['five exercises over two days, two of them first try', [['2026-10-01', 3, 4, 1], ['2026-10-02', 2, 3, 1]]],
    ['three first tries on two days, but a third day has none', [['2026-10-01', 3, 0, 3], ['2026-10-02', 2, 5, 0]]]
  ] as const)('practising: %s', (_name, rows) => {
    expect(stateOf(device(rows.map((r) => [...r]))).status).toBe('practising');
  });

  it('learned: ≥ 3 first tries on ≥ 2 days; box 1, due the next day', () => {
    const s = stateOf(device([['2026-10-01', 2, 0, 2], ['2026-10-03', 1, 0, 1]]));
    expect(s).toEqual({ status: 'learned', firstTries: 3, box: 1, due: '2026-10-04' });
  });

  it('learned across devices: per-day counts are summed over every device of the child', () => {
    const phone = device([['2026-10-01', 2, 1, 2]]);
    const tablet = device([['2026-10-02', 1, 0, 1]]);
    expect(stateOf(phone).status).toBe('practising');
    expect(stateOf(tablet).status).toBe('practising');
    expect(stateOf(phone, tablet)).toMatchObject({ status: 'learned', box: 1, due: '2026-10-03' });
  });

  it('two devices on the same day count as one day', () => {
    const phone = device([['2026-10-01', 2, 0, 2]]);
    const tablet = device([['2026-10-01', 2, 0, 2]]);
    expect(stateOf(phone, tablet).status).toBe('practising');
  });
});

describe('Leitner reviews (fixed histories)', () => {
  // Learned on 10-02 (box 1, due 10-03).
  const learn: [string, number, number, number][] = [['2026-10-01', 2, 0, 2], ['2026-10-02', 1, 0, 1]];

  it('a clean review on the due day moves up one box: 1 → 2, next due in 2 days', () => {
    expect(stateOf(device([...learn, ['2026-10-03', 1, 0, 1]]))).toMatchObject({ box: 2, due: '2026-10-05' });
  });

  it('a clean review after the due day also moves up', () => {
    expect(stateOf(device([...learn, ['2026-10-09', 1, 0, 1]]))).toMatchObject({ box: 2, due: '2026-10-11' });
  });

  it('clean practice before the due day changes nothing', () => {
    const s = stateOf(device([...learn, ['2026-10-03', 1, 0, 1], ['2026-10-04', 3, 0, 3]]));
    expect(s).toMatchObject({ box: 2, due: '2026-10-05' });
  });

  it('climbs the intervals 1, 2, 4, 7, 14, 30 and stays in the top box', () => {
    const rows = [...learn];
    const expected = [
      ['2026-10-03', 2, '2026-10-05'],
      ['2026-10-05', 3, '2026-10-09'],
      ['2026-10-09', 4, '2026-10-16'],
      ['2026-10-16', 5, '2026-10-30'],
      ['2026-10-30', 6, '2026-11-29'],
      ['2026-11-29', 6, '2026-12-29']
    ] as const;
    for (const [day, box, due] of expected) {
      rows.push([day, 1, 0, 1]);
      expect(stateOf(device(rows))).toMatchObject({ status: 'learned', box, due });
    }
  });

  it('a first-try miss drops one box, even before the due day', () => {
    const up = [...learn, ['2026-10-03', 1, 0, 1], ['2026-10-05', 1, 0, 1]] as [string, number, number, number][];
    expect(stateOf(device(up))).toMatchObject({ box: 3, due: '2026-10-09' });
    expect(stateOf(device([...up, ['2026-10-06', 1, 1, 0]]))).toMatchObject({ box: 2, due: '2026-10-08' });
  });

  it('never falls below box 1 and never back to new or practising', () => {
    const s = stateOf(device([...learn, ['2026-10-03', 2, 3, 0], ['2026-10-04', 1, 2, 0], ['2026-10-05', 4, 9, 0]]));
    expect(s).toMatchObject({ status: 'learned', box: 1, due: '2026-10-06' });
  });

  it('isDue: learned and the due day has come', () => {
    const s = stateOf(device(learn));
    expect(isDue(s, '2026-10-02')).toBe(false);
    expect(isDue(s, '2026-10-03')).toBe(true);
    expect(isDue({ status: 'practising', firstTries: 1 }, '2026-12-01')).toBe(false);
  });
});

describe('learning after compaction', () => {
  const today = '2027-06-01';

  it('a word learned before the 120-day window stays learned, and is due at once', () => {
    const p = compactProgress(device([['2026-10-01', 2, 0, 2], ['2026-10-02', 1, 0, 1]]), today);
    expect(p.attempts[W]).toEqual({ old: { c: 3, w: 0, first: 3, days: 2 } });
    const s = stateOf(p);
    expect(s).toMatchObject({ status: 'learned', box: 1 });
    expect(s.due).toBeUndefined();
    expect(isDue(s, today)).toBe(true);
  });

  it('three first tries on one old day are still one day: practising until another day', () => {
    const p = compactProgress(device([['2026-10-01', 3, 0, 3]]), today);
    expect(stateOf(p).status).toBe('practising');
    const later = { ...p, attempts: { [W]: { ...p.attempts[W], '2027-05-30': { c: 1, w: 0, first: 1 } } } };
    expect(stateOf(later)).toMatchObject({ status: 'learned', box: 1, due: '2027-05-31' });
  });

  it('a review after the compacted past moves up from box 1', () => {
    const p = compactProgress(device([['2026-10-01', 2, 0, 2], ['2026-10-02', 1, 0, 1], ['2027-05-30', 1, 0, 1]]), today);
    expect(stateOf(p)).toMatchObject({ status: 'learned', box: 2, due: '2027-06-01' });
  });
});

describe('nextWords: queue → enabled topics → known/paused', () => {
  const topics: Topic[] = [
    { id: 'fruit', en: 'fruit', pl: 'Owoce', icon: 'red-apple', order: 4, words: ['fruit.apple', 'fruit.banana', 'fruit.pear'] },
    { id: 'colours', en: 'colours', pl: 'Kolory', icon: 'artist-palette', order: 2, words: ['colours.red', 'colours.blue'] },
    { id: 'pets', en: 'animals', pl: 'Zwierzęta', icon: 'paw-prints', order: 5, words: ['pets.cat', 'pets.dog'] }
  ];
  const plan = (p: Partial<WordPlan>): WordPlan => ({ ...defaultPlan(), enabledTopics: [], ...p });
  const none = new Map<string, WordState>();
  const learned: WordState = { status: 'learned', firstTries: 3, box: 1, due: '2026-10-04' };

  it.each([
    ['enabled topics in map order, not in the order they were enabled',
      plan({ enabledTopics: ['fruit', 'colours'] }), none,
      ['colours.red', 'colours.blue', 'fruit.apple', 'fruit.banana', 'fruit.pear']],
    ['the queue first, in its own order, then the topics without repeating it',
      plan({ enabledTopics: ['colours'], queue: ['pets.dog', 'colours.blue'] }), none,
      ['pets.dog', 'colours.blue', 'colours.red']],
    ['a queued word from a disabled topic is still taught',
      plan({ queue: ['pets.cat'] }), none, ['pets.cat']],
    ['known words are skipped, in the queue and in topics',
      plan({ enabledTopics: ['colours'], queue: ['colours.red', 'pets.cat'], known: ['colours.red', 'pets.cat'] }), none,
      ['colours.blue']],
    ['paused words are skipped, in the queue and in topics',
      plan({ enabledTopics: ['fruit'], queue: ['fruit.pear'], paused: ['fruit.pear', 'fruit.apple'] }), none,
      ['fruit.banana']],
    ['words that are not new any more are skipped',
      plan({ enabledTopics: ['colours'], queue: ['fruit.apple'] }),
      new Map<string, WordState>([['fruit.apple', learned], ['colours.red', { status: 'introduced', firstTries: 0 }]]),
      ['colours.blue']],
    ['ids the content does not have are skipped',
      plan({ enabledTopics: ['colours'], queue: ['fruit.durian'] }), none, ['colours.red', 'colours.blue']],
    ['nothing enabled and nothing queued',
      plan({}), none, []]
  ] as const)('%s', (_name, p, states, expected) => {
    expect(nextWords(p, states, topics, 'child-1')).toEqual(expected);
  });

  it('stops at the limit', () => {
    expect(nextWords(plan({ enabledTopics: ['fruit', 'colours'] }), none, topics, 'child-1', 3)).toEqual([
      'colours.red',
      'colours.blue',
      'fruit.apple'
    ]);
  });

  it('random within topic: a fixed permutation per child and topic, topics still in map order', () => {
    const random = plan({ enabledTopics: ['fruit', 'colours'], randomWithinTopic: true });
    const first = nextWords(random, none, topics, 'child-1');
    expect(nextWords(random, none, topics, 'child-1')).toEqual(first);
    expect(first.slice(0, 2).sort()).toEqual(['colours.blue', 'colours.red']);
    expect(first.slice(2).sort()).toEqual(['fruit.apple', 'fruit.banana', 'fruit.pear']);
    const many = new Set(
      Array.from({ length: 20 }, (_, i) => nextWords(random, none, topics, `child-${i}`).join(','))
    );
    expect(many.size).toBeGreaterThan(1);
  });
});
