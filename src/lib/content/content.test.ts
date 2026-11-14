import { describe, expect, it } from 'vitest';
import { REQUIRED_PROMPT_IDS } from '../../../scripts/lib/content-rules.mjs';
import { prompt, promptLines, topic, topics, word, words } from '.';

describe('bundled content', () => {
  it('has the first four topics, toys, food, body parts (STATE.md decision 83), clothes and actions (decisions 107, 110), in map order', () => {
    expect(topics.map((t) => t.id)).toEqual(['colours', 'numbers', 'fruit', 'pets-farm', 'toys', 'food', 'body', 'clothes', 'actions']);
  });

  it('every word has its Polish forms and an image id (never a file name)', () => {
    for (const w of words) {
      expect(w.pl.length, w.id).toBeGreaterThan(0);
      expect(w.plAcc?.length, w.id).toBeGreaterThan(0);
      expect(w.image, w.id).toMatch(/^[a-z0-9-]+$/);
      expect(topic(w.topic)?.words, w.id).toContain(w.id);
    }
    expect(word('fruit.banana')?.plAcc).toBe('banana');
  });

  it('every required prompt has Polish text', () => {
    for (const id of REQUIRED_PROMPT_IDS) expect(prompt(id), id).not.toBe('');
  });

  it('a prompt with variants says each of them, never the same line twice in a row', () => {
    const lines = promptLines('map.go');
    expect(lines[0]).toBe('Dotknij statku i płyniemy!');
    expect(lines.length).toBeGreaterThan(1);
    const said = Array.from({ length: 200 }, () => prompt('map.go'));
    expect(new Set(said)).toEqual(new Set(lines));
    for (const [i, line] of said.entries()) if (i > 0) expect(line).not.toBe(said[i - 1]);
  });

  it('a prompt without variants always says its one line', () => {
    expect(promptLines('home.hold')).toHaveLength(1);
    expect(prompt('home.hold', () => 0.99)).toBe('Przytrzymaj dłużej, żeby wyjść.');
  });
});
