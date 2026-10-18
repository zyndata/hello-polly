import { describe, expect, it } from 'vitest';
import { emptyProgress } from './family';
import { COMPACT_AFTER_DAYS, compactProgress } from './compaction';
import { addDays } from './time';

const TODAY = '2026-10-18';
const edge = addDays(TODAY, -COMPACT_AFTER_DAYS);

describe('compactProgress', () => {
  const raw = {
    ...emptyProgress(),
    seq: 7,
    attempts: {
      'fruit.apple': {
        '2026-01-05': { c: 3, w: 1, first: 2 },
        '2026-02-10': { c: 1, w: 2, first: 0 },
        [addDays(edge, -1)]: { c: 1, w: 0, first: 1 },
        [edge]: { c: 2, w: 0, first: 2 },
        '2026-10-17': { c: 1, w: 0, first: 1 }
      },
      'fruit.pear': { '2026-10-01': { c: 1, w: 0, first: 1 } }
    }
  };

  it('folds days older than 120 days into one "old" bucket, counting days with a first try', () => {
    const out = compactProgress(raw, TODAY);
    expect(out.attempts['fruit.apple']).toEqual({
      old: { c: 5, w: 3, first: 3, days: 2 },
      [edge]: { c: 2, w: 0, first: 2 },
      '2026-10-17': { c: 1, w: 0, first: 1 }
    });
    expect(out.attempts['fruit.pear']).toEqual(raw.attempts['fruit.pear']);
  });

  it('bumps seq when it changed something, so the compacted copy wins the merge', () => {
    expect(compactProgress(raw, TODAY).seq).toBe(8);
  });

  it('returns the same object when there is nothing to fold', () => {
    const once = compactProgress(raw, TODAY);
    expect(compactProgress(once, TODAY)).toBe(once);
  });

  it('adds to an existing bucket later', () => {
    const once = compactProgress(raw, TODAY);
    const later = compactProgress(once, '2027-03-01');
    expect(later.attempts['fruit.apple']).toEqual({ old: { c: 8, w: 3, first: 6, days: 4 } });
    expect(later.attempts['fruit.pear']).toEqual({ old: { c: 1, w: 0, first: 1, days: 1 } });
    expect(later.seq).toBe(9);
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(raw);
    compactProgress(raw, TODAY);
    expect(JSON.stringify(raw)).toBe(before);
  });
});
