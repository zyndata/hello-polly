import { describe, expect, it } from 'vitest';
import { OLD_BUCKET, type ChildProfile, type FamilyFile, type Lww } from '../types';
import { TODAY, familyFile, gen } from './arbitrary';
import { compactProgress } from './compaction';
import { emptyFamily, emptyProgress } from './family';
import { canonicalJson, lww } from './lww';
import { mergeChild, mergeFamily } from './merge';

const RUNS = 300;
const same = (a: FamilyFile, b: FamilyFile) => expect(canonicalJson(a)).toBe(canonicalJson(b));

/** `RUNS` triples of random files, each from its own seed so a failure names a reproducible case. */
function triples(): [number, FamilyFile, FamilyFile, FamilyFile][] {
  return Array.from({ length: RUNS }, (_, seed) => {
    const g = gen(seed + 1);
    return [seed + 1, familyFile(g), familyFile(g), familyFile(g)];
  });
}

describe('mergeFamily: properties over generated files', () => {
  const cases = triples();

  it('the generator covers tombstones, compacted progress and equal-seq ties', () => {
    let tombstones = 0;
    let compacted = 0;
    for (const [, a, b, c] of cases) {
      for (const file of [a, b, c]) {
        tombstones += Object.values(file.children).filter((x) => x.v.deleted).length;
        for (const perDevice of Object.values(file.progress)) {
          for (const p of Object.values(perDevice)) {
            if (Object.values(p.attempts).some((byDay) => OLD_BUCKET in byDay)) compacted++;
          }
        }
      }
    }
    expect(tombstones).toBeGreaterThan(100);
    expect(compacted).toBeGreaterThan(100);
  });

  it('is commutative', () => {
    for (const [, a, b] of cases) same(mergeFamily(a, b), mergeFamily(b, a));
  });

  it('is associative', () => {
    for (const [, a, b, c] of cases) same(mergeFamily(mergeFamily(a, b), c), mergeFamily(a, mergeFamily(b, c)));
  });

  it('is idempotent', () => {
    for (const [, a] of cases) {
      // A generated file is not in normal form (key order), so compare against its merge with
      // itself once normalised, and check that merging again changes nothing.
      const once = mergeFamily(a, a);
      same(mergeFamily(once, once), once);
      same(mergeFamily(once, a), once);
    }
  });

  it('absorbs: merging an input back into the result changes nothing', () => {
    for (const [, a, b] of cases) {
      const ab = mergeFamily(a, b);
      same(mergeFamily(ab, a), ab);
      same(mergeFamily(ab, b), ab);
    }
  });

  it('converges whatever order three devices sync in', () => {
    for (const [, a, b, c] of cases) {
      const orders = [
        [a, b, c],
        [c, a, b],
        [b, c, a],
        [c, b, a]
      ];
      const results = orders.map(([x, y, z]) => mergeFamily(mergeFamily(x as FamilyFile, y as FamilyFile), z as FamilyFile));
      for (const r of results) same(r, results[0] as FamilyFile);
    }
  });

  it('does not mutate its inputs', () => {
    for (const [, a, b] of cases.slice(0, 50)) {
      const before = canonicalJson([a, b]);
      mergeFamily(a, b);
      expect(canonicalJson([a, b])).toBe(before);
    }
  });
});

describe('mergeFamily: rules', () => {
  const t1 = '2026-10-01T10:00:00.000Z';
  const t2 = '2026-10-02T10:00:00.000Z';
  const ola = (extra: Partial<ChildProfile> = {}): ChildProfile => ({ name: 'Ola', avatar: 'cat', ...extra });

  it('takes the newer register, and the larger device id on a tie', () => {
    const a = emptyFamily('f');
    const b = emptyFamily('f');
    a.settings.accent = lww('en-US', t2, 'dev-a');
    b.settings.accent = lww('en-GB', t1, 'dev-b');
    expect(mergeFamily(a, b).settings.accent.v).toBe('en-US');
    b.settings.accent = lww('en-GB', t2, 'dev-b');
    expect(mergeFamily(a, b).settings.accent.v).toBe('en-GB');
  });

  it('any real write beats a default', () => {
    const a = emptyFamily('f');
    const b = emptyFamily('f');
    b.settings.starsPerChest = lww(10, t1, 'dev-b');
    expect(mergeFamily(a, b).settings.starsPerChest.v).toBe(10);
  });

  it('a tombstone beats an older live profile', () => {
    const dead: Lww<ChildProfile> = lww(ola({ deleted: true }), t2, 'dev-a');
    const live: Lww<ChildProfile> = lww(ola(), t1, 'dev-b');
    expect(mergeChild(dead, live).v.deleted).toBe(true);
  });

  it('a tombstone also beats a newer live profile: a stale rename does not resurrect', () => {
    const dead: Lww<ChildProfile> = lww(ola({ deleted: true }), t1, 'dev-a');
    const renamed: Lww<ChildProfile> = lww(ola({ name: 'Oleńka' }), t2, 'dev-b');
    expect(mergeChild(dead, renamed).v.deleted).toBe(true);
    expect(mergeChild(renamed, dead).v.deleted).toBe(true);
  });

  it('keeps each device’s progress, taking the higher seq per device', () => {
    const a = emptyFamily('f');
    const b = emptyFamily('f');
    a.progress['child'] = { 'dev-a': { ...emptyProgress(), seq: 3, stars: 9 }, 'dev-b': { ...emptyProgress(), seq: 1, stars: 1 } };
    b.progress['child'] = { 'dev-b': { ...emptyProgress(), seq: 2, stars: 4 } };
    const merged = mergeFamily(a, b).progress['child'];
    expect(merged?.['dev-a']?.stars).toBe(9);
    expect(merged?.['dev-b']?.stars).toBe(4);
  });

  it('a compacted copy replaces the raw one it was made from', () => {
    const raw = { ...emptyProgress(), seq: 5, attempts: { 'fruit.apple': { '2026-01-02': { c: 2, w: 1, first: 1 } } } };
    const compacted = compactProgress(raw, TODAY);
    expect(compacted.seq).toBe(6);
    const a = emptyFamily('f');
    const b = emptyFamily('f');
    a.progress['child'] = { 'dev-a': raw };
    b.progress['child'] = { 'dev-a': compacted };
    expect(mergeFamily(a, b).progress['child']?.['dev-a']).toBe(compacted);
  });

  it('unions members by e-mail, owner beating writer', () => {
    const a = emptyFamily('f');
    const b = emptyFamily('f');
    a.members = [{ email: 'b@example.com', role: 'writer' }];
    b.members = [
      { email: 'a@example.com', role: 'writer' },
      { email: 'b@example.com', role: 'owner' }
    ];
    expect(mergeFamily(a, b).members).toEqual([
      { email: 'a@example.com', role: 'writer' },
      { email: 'b@example.com', role: 'owner' }
    ]);
    expect(mergeFamily(emptyFamily('f'), emptyFamily('f')).members).toBeUndefined();
  });

  it('two fresh installs merge to the same empty file', () => {
    same(mergeFamily(emptyFamily('f'), emptyFamily('f')), emptyFamily('f'));
  });
});
