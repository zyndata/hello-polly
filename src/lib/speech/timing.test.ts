import { describe, expect, it } from 'vitest';
import { MS_PER_CHAR, estimateMs, fallbackSchedule, watchdogMs, wordAt, wordRanges } from './timing';

describe('timing', () => {
  it('finds words, keeping apostrophes inside them', () => {
    expect(wordRanges("Hello! Polly's 2 apples.").map((r) => [r.start, r.text])).toEqual([
      [0, 'Hello'],
      [7, "Polly's"],
      [15, '2'],
      [17, 'apples']
    ]);
  });

  it('maps a character offset to the word it is in or after', () => {
    const ranges = wordRanges('  I like fruit.');
    expect([0, 2, 3, 4, 8, 9, 14, 99].map((i) => wordAt(ranges, i))).toEqual([-1, 0, 0, 1, 1, 2, 2, 2]);
  });

  it('estimates longer at slower rates', () => {
    expect(estimateMs('banana', 1)).toBe(6 * MS_PER_CHAR);
    expect(estimateMs('banana', 0.5)).toBe(12 * MS_PER_CHAR);
    expect(watchdogMs('banana', 1)).toBe(18 * MS_PER_CHAR + 4000);
  });

  it('schedules each word by its first character', () => {
    expect(fallbackSchedule('I like fruit.', 1)).toEqual([0, 2 * MS_PER_CHAR, 7 * MS_PER_CHAR]);
    expect(fallbackSchedule('I like fruit.', 0.5)).toEqual([0, 4 * MS_PER_CHAR, 14 * MS_PER_CHAR]);
  });
});
