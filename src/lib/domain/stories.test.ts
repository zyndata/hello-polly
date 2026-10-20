import { describe, expect, it } from 'vitest';
import { stories, topics, word, words } from '../content';
import { DEFAULT_SETTINGS } from './family';
import { addChild } from './children';
import { emptyFamily } from './family';
import type { WordState } from './learning';
import { mentions, estimateStoryMs, recordStory, storyIsNew, storyOpen, storyProgress, storyWords, timesHeard } from './stories';
import type { Story } from '../types';

const T = '2026-10-20T08:00:00.000Z';
const learned = (ids: string[]): Map<string, WordState> =>
  new Map(ids.map((id) => [id, { status: 'learned', firstTries: 3, days: 2, box: 1, due: '2026-10-21' } as WordState]));

const picnic = stories.find((s) => s.id === 'polly-picnic') as Story;

describe('stories', () => {
  it('ships one story per level-1 topic, the body parts included (decision 83)', () => {
    const level1 = topics.filter((t) => t.words.some((id) => word(id)?.level === 1)).map((t) => t.id);
    expect(stories.map((s) => s.topic).sort()).toEqual([...level1].sort());
    expect(stories.length).toBeGreaterThanOrEqual(4);
  });

  it("counts a story's pictured words, not the adjectives in its text (decision 84)", () => {
    expect(storyWords(picnic)).toEqual(['fruit.apple', 'fruit.banana', 'fruit.orange', 'fruit.pear', 'fruit.grapes']);
    // „A red apple”, „a yellow banana”: the colours are spoken, but not pictures, so not counted.
    expect(storyWords(picnic).some((id) => id.startsWith('colours.'))).toBe(false);
  });

  it('unlocks at 80 % of its words learned', () => {
    const five = storyWords(picnic);
    expect(storyProgress(picnic, learned(five.slice(0, 3)))).toEqual({ learned: 3, total: 5 });
    expect(storyOpen(picnic, learned(five.slice(0, 3)))).toBe(false);
    expect(storyOpen(picnic, learned(five.slice(0, 4)))).toBe(true);
    expect(storyOpen(picnic, learned([]))).toBe(false);
    // Practising is not learned.
    const practising = new Map(five.map((id) => [id, { status: 'practising' } as WordState]));
    expect(storyOpen(picnic, practising)).toBe(false);
  });

  it('every story of each topic opens with that topic learned, and every story has 5–8 pages', () => {
    for (const story of stories) {
      const topic = topics.find((t) => t.id === story.topic);
      expect(storyOpen(story, learned(topic?.words ?? [])), story.id).toBe(true);
      expect(story.pages.length, story.id).toBeGreaterThanOrEqual(5);
      expect(story.pages.length, story.id).toBeLessThanOrEqual(8);
    }
  });

  it('is estimated at 25–40 s at the normal rate (and at the extremes of its range, 20–50 s)', () => {
    for (const story of stories) {
      const ms = estimateStoryMs(story, DEFAULT_SETTINGS.normalRate);
      expect(ms, story.id).toBeGreaterThanOrEqual(25_000);
      expect(ms, story.id).toBeLessThanOrEqual(40_000);
      expect(estimateStoryMs(story, 1.1), story.id).toBeGreaterThanOrEqual(20_000);
      expect(estimateStoryMs(story, 0.8), story.id).toBeLessThanOrEqual(50_000);
    }
  });

  it('knows which picture each spoken word names, so it can bounce', () => {
    const page = picnic.pages[3]; // "An orange and a pear."
    expect(page?.text).toBe('An orange and a pear.');
    expect(mentions(page as Story['pages'][number], word)).toEqual([[], [0], [], [], [1]]);
    // Every scene word of every story is spoken on its page.
    for (const story of stories) {
      for (const p of story.pages) {
        const named = new Set(mentions(p, word).flat());
        p.scene.forEach((item, i) => {
          if (item.word) expect(named.has(i), `${story.id}: ${item.word}`).toBe(true);
        });
      }
    }
  });

  it('records a story heard on this device, and counts it over every device', () => {
    let file = addChild(emptyFamily('f'), 'c1', { name: 'Ola', avatar: 'fox' }, T, 'dev-a');
    file = recordStory(file, 'c1', 'dev-a', 'polly-picnic');
    file = recordStory(file, 'c1', 'dev-b', 'polly-picnic');
    file = recordStory(file, 'c1', 'dev-a', 'polly-picnic');
    expect(file.progress.c1?.['dev-a']?.storiesHeard).toEqual({ 'polly-picnic': 2 });
    expect(file.progress.c1?.['dev-a']?.seq).toBe(2);
    expect(timesHeard(file.progress.c1, 'polly-picnic')).toBe(3);
    expect(timesHeard(file.progress.c1, 'polly-flags')).toBe(0);
    const all = learned(words.map((w) => w.id));
    expect(storyIsNew(picnic, all, file.progress.c1)).toBe(false);
    expect(storyIsNew(stories.find((s) => s.id === 'polly-flags') as Story, all, file.progress.c1)).toBe(true);
    expect(storyIsNew(stories.find((s) => s.id === 'polly-flags') as Story, learned([]), file.progress.c1)).toBe(false);
  });
});
