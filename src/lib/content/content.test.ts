import { describe, expect, it } from 'vitest';
import { REQUIRED_PROMPT_IDS } from '../../../scripts/lib/content-rules.mjs';
import { prompt, topic, topics, word, words } from '.';

describe('bundled content', () => {
  it('has the first four topics and body parts (STATE.md decision 83), in map order', () => {
    expect(topics.map((t) => t.id)).toEqual(['colours', 'numbers', 'fruit', 'pets-farm', 'body']);
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
});
