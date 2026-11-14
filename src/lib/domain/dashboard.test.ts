import { describe, expect, it } from 'vitest';
import { activeDays, activityCalendar, learnedPerTopic, minutesByDay, needsPractice, recentMinutes, stickersCollected, storiesHeard } from './dashboard';
import { defaultPlan, emptyProgress } from './family';
import { wordStates, type WordState } from './learning';
import type { DeviceProgress, Sticker, Topic } from '../types';

const progress = (patch: Partial<DeviceProgress>): DeviceProgress => ({ ...emptyProgress(), seq: 1, ...patch });

const TOPICS: Topic[] = [
  { id: 'fruit', en: 'Fruit', pl: 'Owoce', icon: 'red-apple', order: 2, words: ['fruit.apple', 'fruit.banana', 'fruit.pear'] },
  { id: 'colours', en: 'Colours', pl: 'Kolory', icon: 'artist-palette', order: 1, words: ['colours.red', 'colours.blue'] },
  { id: 'body', en: 'Body', pl: 'Ciało', icon: 'raised-hand', order: 5, words: ['body.nose'] },
  { id: 'pets', en: 'Pets', pl: 'Zwierzęta', icon: 'paw-prints', order: 3, words: ['pets.cat'] }
];

describe('learned words per topic', () => {
  it('counts learned and met words, in map order, for enabled topics and any with a word met', () => {
    const states = new Map<string, WordState>([
      ['fruit.apple', { status: 'learned', firstTries: 3, box: 1 }],
      ['fruit.banana', { status: 'practising', firstTries: 1 }],
      ['body.nose', { status: 'introduced', firstTries: 0 }]
    ]);
    const plan = { ...defaultPlan(), enabledTopics: ['fruit', 'colours'] };
    expect(learnedPerTopic(states, plan, TOPICS).map((t) => [t.topic.id, t.learned, t.met, t.total])).toEqual([
      ['colours', 0, 0, 2],
      ['fruit', 1, 2, 3],
      ['body', 0, 1, 1]
    ]);
  });
});

describe('words that need practice', () => {
  it('most first-try misses first, over every device and day, then the most recent miss', () => {
    const p = {
      a: progress({
        attempts: {
          'fruit.apple': { '2026-10-01': { c: 2, w: 3, first: 0 }, old: { c: 4, w: 1, first: 3, days: 2 } },
          'fruit.banana': { '2026-10-10': { c: 3, w: 0, first: 3 } },
          'colours.red': { '2026-10-02': { c: 2, w: 2, first: 1 } }
        }
      }),
      b: progress({
        attempts: {
          'colours.red': { '2026-10-15': { c: 2, w: 1, first: 1 } },
          'pets.cat': { '2026-10-03': { c: 3, w: 4, first: 1 } },
          'gone.word': { '2026-10-03': { c: 9, w: 9, first: 0 } }
        }
      })
    };
    expect(needsPractice(p, (id) => id !== 'gone.word')).toEqual([
      { word: 'fruit.apple', misses: 3, lastMiss: '2026-10-01' },
      { word: 'colours.red', misses: 2, lastMiss: '2026-10-15' },
      { word: 'pets.cat', misses: 2, lastMiss: '2026-10-03' }
    ]);
    expect(needsPractice(p, () => true, 1).map((w) => w.word)).toEqual(['gone.word']);
    expect(needsPractice(undefined, () => true)).toEqual([]);
  });

  it('a word whose misses are all compacted still shows, after the dated ones', () => {
    const p = { a: progress({ attempts: { 'fruit.pear': { old: { c: 3, w: 2, first: 1, days: 1 } }, 'fruit.apple': { '2026-10-01': { c: 3, w: 2, first: 1 } } } }) };
    expect(needsPractice(p, () => true)).toEqual([
      { word: 'fruit.apple', misses: 2, lastMiss: '2026-10-01' },
      { word: 'fruit.pear', misses: 2 }
    ]);
  });
});

describe('the activity calendar', () => {
  const p = {
    phone: progress({
      minutes: { '2026-10-20': 4, '2026-10-19': 3, '2026-09-21': 50 },
      attempts: { 'fruit.apple': { '2026-10-14': { c: 1, w: 0, first: 1 }, old: { c: 1, w: 0, first: 1 } } }
    }),
    tablet: progress({
      minutes: { '2026-10-20': 2, '2026-10-12': 20 },
      lessons: { l1: { at: '2026-10-07T10:00:00.000Z', words: [] } }
    })
  };

  it("sums minutes across devices per day, and knows the days with any answer or lesson", () => {
    expect(Object.fromEntries(minutesByDay(p))).toEqual({ '2026-10-20': 6, '2026-10-19': 3, '2026-09-21': 50, '2026-10-12': 20 });
    expect([...activeDays(p)].sort()).toEqual(['2026-10-07', '2026-10-14']);
    expect(recentMinutes(p, '2026-10-20', 1)).toBe(6);
    expect(recentMinutes(p, '2026-10-20', 7)).toBe(9);
    expect(recentMinutes(p, '2026-10-20', 9)).toBe(29);
  });

  it('is four Monday-first weeks ending with the week of today; later days are empty', () => {
    // 2026-10-20 is a Tuesday.
    const weeks = activityCalendar(p, '2026-10-20');
    expect(weeks).toHaveLength(4);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]?.[0]?.day).toBe('2026-09-28');
    expect(weeks[3]?.[0]?.day).toBe('2026-10-19');
    const byDay = new Map(weeks.flat().map((c) => [c.day, c]));
    expect(byDay.get('2026-10-20')).toEqual({ day: '2026-10-20', minutes: 6, active: true, level: 2, future: false });
    expect(byDay.get('2026-10-19')).toMatchObject({ minutes: 3, level: 1 });
    expect(byDay.get('2026-10-12')).toMatchObject({ minutes: 20, level: 3 });
    expect(byDay.get('2026-10-14')).toMatchObject({ minutes: 0, active: true, level: 1 });
    expect(byDay.get('2026-10-13')).toMatchObject({ minutes: 0, active: false, level: 0 });
    expect(byDay.get('2026-10-21')).toMatchObject({ future: true, level: 0, active: false });
    expect(byDay.has('2026-09-21')).toBe(false);
    // A Sunday today: the whole last week is past.
    expect(activityCalendar(p, '2026-10-25')[3]?.every((c) => !c.future)).toBe(true);
  });
});

describe('stickers collected and stories heard', () => {
  const STICKERS: Sticker[] = [
    { id: 'fruit.apple', image: 'red-apple', set: 'fruit' },
    { id: 'fruit.pear', image: 'pear', set: 'fruit' },
    { id: 'colours.red', image: 'red-flag', set: 'colours' }
  ];
  const p = {
    a: progress({ chestsOpened: { c1: { at: '2026-10-01T10:00:00.000Z', stickers: ['fruit.apple'] } }, storiesHeard: { picnic: 2 } }),
    b: progress({ chestsOpened: { c2: { at: '2026-10-02T10:00:00.000Z', stickers: ['fruit.apple', 'colours.red'] } }, storiesHeard: { picnic: 1, flags: 1 } })
  };

  it('counts each sticker once, over every device, per set', () => {
    expect(stickersCollected(p, STICKERS)).toEqual({
      owned: 2,
      total: 3,
      sets: [
        { set: 'fruit', owned: 1, total: 2 },
        { set: 'colours', owned: 1, total: 1 }
      ]
    });
  });

  it('lists every story with its times heard, summed', () => {
    expect(storiesHeard(p, [{ id: 'picnic' }, { id: 'flags' }, { id: 'farm' }])).toEqual([
      { story: 'picnic', times: 3 },
      { story: 'flags', times: 1 },
      { story: 'farm', times: 0 }
    ]);
    expect(wordStates(p).size).toBe(0);
  });
});
