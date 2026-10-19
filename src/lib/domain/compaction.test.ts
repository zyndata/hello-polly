import { describe, expect, it } from 'vitest';
import { OLD_BUCKET, type FamilyFile } from '../types';
import { emptyFamily, emptyProgress } from './family';
import { COMPACT_AFTER_DAYS, compactProgress, tidyOwnProgress } from './compaction';
import { lww } from './lww';
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

describe('tidyOwnProgress', () => {
  const old = { [addDays(TODAY, -200)]: { c: 1, w: 0, first: 1 } };
  const file = (): FamilyFile => {
    const f = emptyFamily('fam');
    f.children = {
      live: lww({ name: 'Ola', avatar: 'fox' }, '2026-10-01T00:00:00.000Z', 'me'),
      gone: lww({ name: '', avatar: '', deleted: true }, '2026-10-02T00:00:00.000Z', 'me')
    };
    f.progress = {
      live: { me: { ...emptyProgress(), seq: 3, attempts: { 'fruit.apple': old } }, other: { ...emptyProgress(), seq: 5, attempts: { 'fruit.apple': old } } },
      gone: { me: { ...emptyProgress(), seq: 2, stars: 9 }, other: { ...emptyProgress(), seq: 4, stars: 3 } }
    };
    return f;
  };

  it('compacts and empties only this device\'s subtrees, bumping their seq', () => {
    const tidy = tidyOwnProgress(file(), 'me', TODAY);
    expect(Object.keys(tidy.progress.live?.me?.attempts['fruit.apple'] ?? {})).toEqual([OLD_BUCKET]);
    expect(tidy.progress.live?.me?.seq).toBe(4);
    expect(tidy.progress.gone?.me).toEqual({ ...emptyProgress(), seq: 3 });
    // Another device's subtrees are its own business.
    expect(tidy.progress.live?.other).toEqual(file().progress.live?.other);
    expect(tidy.progress.gone?.other?.stars).toBe(3);
  });

  it('returns the same file when there is nothing to do, so a second pass changes nothing', () => {
    const once = tidyOwnProgress(file(), 'me', TODAY);
    expect(tidyOwnProgress(once, 'me', TODAY)).toBe(once);
    const untouched = file();
    expect(tidyOwnProgress(untouched, 'nobody', TODAY)).toBe(untouched);
  });
});
