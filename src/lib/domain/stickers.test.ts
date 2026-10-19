import { describe, expect, it } from 'vitest';
import { stickers, topics } from '../content';
import type { Sticker, WordId } from '../types';
import { TODAY, familyFile, gen } from './arbitrary';
import { addChild } from './children';
import { emptyFamily } from './family';
import type { WordState } from './learning';
import { mergeFamily } from './merge';
import { addStars, recordChest } from './progress';
import { album, chestState } from './rewards';
import { PREVIEW_WORDS, albumPages, drawForChild, drawStickers, stickerWeight, type DrawInput } from './stickers';

const learned: WordState = { status: 'learned', firstTries: 3, box: 1, due: TODAY };
const practising: WordState = { status: 'practising', firstTries: 1 };

const states = (entries: Record<WordId, WordState>) => new Map(Object.entries(entries));
const bySet = (set: string) => stickers.filter((s) => s.set === set);

describe('drawStickers', () => {
  const input: DrawInput = {
    stickers,
    owned: new Set(['fruit.apple', 'fruit.banana']),
    states: states({ 'fruit.apple': learned, 'fruit.banana': learned, 'fruit.pear': learned, 'colours.red': practising }),
    upcoming: ['colours.blue', 'colours.yellow']
  };

  it('is deterministic given its seed', () => {
    for (let i = 0; i < 50; i++) expect(drawStickers(input, `seed-${i}`)).toEqual(drawStickers(input, `seed-${i}`));
    const draws = new Set(Array.from({ length: 50 }, (_, i) => drawStickers(input, `seed-${i}`).join()));
    expect(draws.size).toBeGreaterThan(5);
  });

  it('holds 1 to 3 stickers, each at most once', () => {
    const counts = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const drawn = drawStickers(input, `n-${i}`);
      counts.add(drawn.length);
      expect(new Set(drawn).size).toBe(drawn.length);
    }
    expect([...counts].sort()).toEqual([1, 2, 3]);
  });

  it('never repeats a sticker of an incomplete set, over random albums and states', () => {
    const g = gen(7);
    const ids = stickers.map((s) => s.id);
    for (let run = 0; run < 400; run++) {
      const owned = new Set(ids.filter(() => g.chance(0.6)));
      const st = new Map<WordId, WordState>();
      for (const id of ids) {
        const r = g.int(4);
        if (r === 1) st.set(id, learned);
        if (r === 2) st.set(id, practising);
      }
      const drawn = drawStickers({ stickers, owned, states: st, upcoming: ids.filter(() => g.chance(0.1)) }, `run-${run}`);
      const incomplete = new Set(stickers.filter((s) => !owned.has(s.id)).map((s) => s.set));
      for (const id of drawn) {
        const set = stickers.find((s) => s.id === id)?.set as string;
        if (incomplete.has(set)) expect(owned.has(id), `run ${run}: ${id} repeated`).toBe(false);
      }
      // With anything left to collect, nothing owned comes out at all.
      if (owned.size < ids.length) for (const id of drawn) expect(owned.has(id)).toBe(false);
    }
  });

  it('a whole album owned: repeats across chests, never within one', () => {
    const all = new Set(stickers.map((s) => s.id));
    for (let i = 0; i < 100; i++) {
      const drawn = drawStickers({ ...input, owned: all }, `full-${i}`);
      expect(drawn.length).toBeGreaterThan(0);
      expect(new Set(drawn).size).toBe(drawn.length);
    }
  });

  it('favours learned words, then met ones, then the preview, and nothing else while those last', () => {
    const tally = new Map<string, number>();
    for (let i = 0; i < 2000; i++) for (const id of drawStickers(input, `bias-${i}`)) tally.set(id, (tally.get(id) ?? 0) + 1);
    const pear = tally.get('fruit.pear') ?? 0;
    const red = tally.get('colours.red') ?? 0;
    const blue = tally.get('colours.blue') ?? 0;
    expect(pear).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
    expect(blue).toBeGreaterThan(0);
    // Owned stickers never; words neither met nor next never, while others are left.
    expect(tally.has('fruit.apple')).toBe(false);
    expect(tally.has('pets-farm.duck')).toBe(false);
  });

  it('with nothing met and nothing next, any sticker will do', () => {
    const drawn = drawStickers({ stickers, owned: new Set(), states: new Map(), upcoming: [] }, 'empty');
    expect(drawn.length).toBeGreaterThan(0);
  });

  it('only the first few upcoming words are a preview', () => {
    const upcoming = bySet('pets-farm').map((s) => s.word as WordId);
    const preview = new Set(upcoming.slice(0, PREVIEW_WORDS));
    const tally = new Set<string>();
    for (let i = 0; i < 500; i++) for (const id of drawStickers({ stickers, owned: new Set(), states: new Map(), upcoming }, `p-${i}`)) tally.add(id);
    expect([...tally].every((id) => preview.has(id))).toBe(true);
  });

  it('a rare sticker weighs half, so it comes later but still comes', () => {
    const horse = stickers.find((s) => s.id === 'pets-farm.horse') as Sticker;
    const cow = stickers.find((s) => s.id === 'pets-farm.cow') as Sticker;
    const st = states({ 'pets-farm.horse': learned, 'pets-farm.cow': learned });
    expect(horse.rare).toBe(true);
    expect(stickerWeight(horse, st, new Set())).toBe(stickerWeight(cow, st, new Set()) / 2);
    const pair = { stickers: [horse, cow], owned: new Set<string>(), states: st, upcoming: [] };
    let horseFirst = 0;
    for (let i = 0; i < 1000; i++) if (drawStickers(pair, `r-${i}`)[0] === 'pets-farm.horse') horseFirst += 1;
    expect(horseFirst).toBeGreaterThan(250);
    expect(horseFirst).toBeLessThan(420);
  });
});

describe('the sticker content', () => {
  it('one sticker per word, showing its picture, in its topic set; about 1 in 10 rare', () => {
    const words = topics.flatMap((t) => t.words);
    expect(stickers.map((s) => s.id).sort()).toEqual([...words].sort());
    for (const s of stickers) {
      expect(s.word).toBe(s.id);
      expect(topics.find((t) => t.id === s.set)?.words).toContain(s.id);
    }
    const rare = stickers.filter((s) => s.rare);
    expect(rare.length / stickers.length).toBeGreaterThan(0.05);
    expect(rare.length / stickers.length).toBeLessThan(0.15);
  });
});

describe('albumPages', () => {
  it('one page per set in map order, slots in teaching order, with the owned count', () => {
    const pages = albumPages(stickers, new Set(['fruit.pear', 'fruit.apple', 'colours.red']), topics);
    expect(pages.map((p) => p.set)).toEqual(topics.map((t) => t.id));
    const fruit = pages.find((p) => p.set === 'fruit');
    expect(fruit?.stickers.map((s) => s.id)).toEqual(topics.find((t) => t.id === 'fruit')?.words);
    expect(fruit?.owned).toBe(2);
    expect(pages.find((p) => p.set === 'colours')?.owned).toBe(1);
  });

  it('a set that is no topic comes after the topics', () => {
    const extra: Sticker = { id: 'sea.chest', image: 'sailboat', set: 'sea' };
    expect(albumPages([extra, ...stickers], new Set(), topics).map((p) => p.set).at(-1)).toBe('sea');
  });
});

describe('chests', () => {
  const T1 = '2026-10-18T10:00:00.000Z';
  const T2 = '2026-10-18T11:00:00.000Z';

  it('recordChest is idempotent per event id and bumps seq once', () => {
    let file = addChild(emptyFamily('f'), 'c1', { name: 'Ola', avatar: 'fox' }, T1, 'dev-a');
    file = addStars(file, 'c1', 'dev-a', 30);
    const once = recordChest(file, 'c1', 'dev-a', 'e1', { at: T2, stickers: ['fruit.apple'] });
    expect(recordChest(once, 'c1', 'dev-a', 'e1', { at: T2, stickers: ['fruit.pear'] })).toBe(once);
    expect(once.progress.c1?.['dev-a']?.seq).toBe((file.progress.c1?.['dev-a']?.seq ?? 0) + 1);
    expect(chestState(once.progress.c1, 15)).toEqual({ unopened: 1, meter: 0 });
    expect([...album(once.progress.c1)]).toEqual(['fruit.apple']);
  });

  it('a chest drawn for a child comes from the album it does not have yet', () => {
    let file = addChild(emptyFamily('f'), 'c1', { name: 'Ola', avatar: 'fox' }, T1, 'dev-a');
    file = recordChest(file, 'c1', 'dev-a', 'e1', { at: T2, stickers: ['colours.red', 'colours.blue'] });
    for (let i = 0; i < 50; i++) {
      const drawn = drawForChild(file, 'c1', stickers, topics, `e-${i}`);
      expect(drawn).not.toContain('colours.red');
      expect(drawn).not.toContain('colours.blue');
      expect(drawn).toEqual(drawForChild(file, 'c1', stickers, topics, `e-${i}`));
    }
  });

  it('unopened chests and the album are identical after merging two devices, in either order', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const g = gen(seed);
      const a = familyFile(g);
      const b = familyFile(g);
      const ab = mergeFamily(a, b);
      const ba = mergeFamily(b, a);
      for (const child of new Set([...Object.keys(a.progress), ...Object.keys(b.progress)])) {
        expect(chestState(ab.progress[child], 15)).toEqual(chestState(ba.progress[child], 15));
        expect([...album(ab.progress[child])].sort()).toEqual([...album(ba.progress[child])].sort());
        // Merging again changes nothing (a third device syncing late).
        expect(chestState(mergeFamily(ab, a).progress[child], 15)).toEqual(chestState(ab.progress[child], 15));
      }
    }
  });

  it('a chest opened on one phone is gone on the other after a sync, and its stickers arrive', () => {
    let phone = addChild(emptyFamily('f'), 'c1', { name: 'Ola', avatar: 'fox' }, T1, 'phone');
    phone = addStars(phone, 'c1', 'phone', 20);
    let tablet = mergeFamily(emptyFamily('f'), phone);
    tablet = addStars(tablet, 'c1', 'tablet', 12);
    // Before the sync: the phone sees one chest, the tablet two (it has both devices' stars).
    expect(chestState(phone.progress.c1, 15).unopened).toBe(1);
    expect(chestState(tablet.progress.c1, 15).unopened).toBe(2);
    phone = recordChest(phone, 'c1', 'phone', 'e1', { at: T2, stickers: ['fruit.pear'] });
    const synced = mergeFamily(phone, tablet);
    expect(chestState(synced.progress.c1, 15)).toEqual({ unopened: 1, meter: 2 });
    expect(chestState(mergeFamily(tablet, phone).progress.c1, 15)).toEqual({ unopened: 1, meter: 2 });
    expect([...album(synced.progress.c1)]).toEqual(['fruit.pear']);
  });
});
