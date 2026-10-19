/**
 * The sticker draw and the album (PLAN.md "Rewards"; STATE.md decisions 56–58, 62).
 *
 * The draw is pure and seeded by the chest's event id, so the same seed, album and word states
 * give the same stickers on every device. It never draws a sticker the child owns until the
 * whole album is owned, and never the same sticker twice in one chest.
 */

import type { ChildId, FamilyFile, Sticker, Topic, WordId } from '../types';
import { childPlan } from './children';
import { nextWords, wordStates, type WordState } from './learning';
import { hashString, mulberry32 } from './random';
import { album } from './rewards';

/** How many stickers a chest holds, with their chances (decision 58). */
export const STICKER_COUNTS = [
  { n: 1, p: 0.4 },
  { n: 2, p: 0.4 },
  { n: 3, p: 0.2 }
] as const;

/** Weights by what the child knows of the sticker's word. */
export const WEIGHTS = { learned: 6, met: 2, preview: 1, other: 0 } as const;
/** A rare sticker's weight is multiplied by this. */
export const RARE_FACTOR = 0.5;
/** How many of the next words to be taught count as a "preview". */
export const PREVIEW_WORDS = 5;

export interface DrawInput {
  stickers: readonly Sticker[];
  /** Sticker ids the child already owns (the union over every device). */
  owned: ReadonlySet<string>;
  /** Derived word states; a word with none is new. */
  states: ReadonlyMap<WordId, WordState>;
  /** The next words the child will be taught, in order. */
  upcoming: readonly WordId[];
}

/** The weight of one sticker before rarity, by its word. */
export function stickerWeight(sticker: Sticker, states: ReadonlyMap<WordId, WordState>, preview: ReadonlySet<WordId>): number {
  const status = sticker.word === undefined ? 'new' : (states.get(sticker.word)?.status ?? 'new');
  const base =
    status === 'learned'
      ? WEIGHTS.learned
      : status !== 'new'
        ? WEIGHTS.met
        : sticker.word !== undefined && preview.has(sticker.word)
          ? WEIGHTS.preview
          : WEIGHTS.other;
  return base * (sticker.rare ? RARE_FACTOR : 1);
}

/** The stickers in one chest, in the order they fly out. */
export function drawStickers({ stickers, owned, states, upcoming }: DrawInput, seed: string): string[] {
  const next = mulberry32(hashString(`chest/${seed}`));
  const roll = next();
  let count: number = STICKER_COUNTS[STICKER_COUNTS.length - 1]!.n;
  let acc = 0;
  for (const c of STICKER_COUNTS) {
    acc += c.p;
    if (roll < acc) {
      count = c.n;
      break;
    }
  }

  const unowned = stickers.filter((s) => !owned.has(s.id));
  const pool = unowned.length > 0 ? unowned : [...stickers];
  const preview = new Set(upcoming.slice(0, PREVIEW_WORDS));
  let weighted = pool.map((s) => ({ id: s.id, w: stickerWeight(s, states, preview) }));
  // Nothing the child knows or is about to learn is left: any sticker will do.
  if (weighted.every((c) => c.w === 0)) weighted = weighted.map((c) => ({ ...c, w: 1 }));
  weighted = weighted.filter((c) => c.w > 0);

  const out: string[] = [];
  while (out.length < count && weighted.length > 0) {
    const total = weighted.reduce((sum, c) => sum + c.w, 0);
    let r = next() * total;
    let i = 0;
    for (; i < weighted.length - 1; i++) {
      r -= weighted[i]!.w;
      if (r < 0) break;
    }
    out.push(weighted[i]!.id);
    weighted.splice(i, 1);
  }
  return out;
}

/** The draw for a chest of one child, from the merged family file. */
export function drawForChild(file: FamilyFile, child: ChildId, stickers: readonly Sticker[], topics: readonly Topic[], seed: string): string[] {
  const progress = file.progress[child];
  const states = wordStates(progress);
  const upcoming = nextWords(childPlan(file, child), states, topics, child, PREVIEW_WORDS);
  return drawStickers({ stickers, owned: album(progress), states, upcoming }, seed);
}

export interface AlbumPage {
  set: string;
  stickers: Sticker[];
  owned: number;
}

/**
 * The album's pages: one per set, sets that are topics first in map order (each in its
 * teaching order), any other set after them in the order it first appears.
 */
export function albumPages(stickers: readonly Sticker[], owned: ReadonlySet<string>, topics: readonly Topic[]): AlbumPage[] {
  const bySet = new Map<string, Sticker[]>();
  for (const s of stickers) {
    const list = bySet.get(s.set);
    if (list) list.push(s);
    else bySet.set(s.set, [s]);
  }
  const ordered = [...topics].sort((a, b) => a.order - b.order);
  const rank = (set: string) => {
    const i = ordered.findIndex((t) => t.id === set);
    return i < 0 ? ordered.length : i;
  };
  const position = (topic: Topic | undefined, s: Sticker) => {
    const i = s.word === undefined || !topic ? -1 : topic.words.indexOf(s.word);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sets = [...bySet.keys()];
  return sets
    .map((set, first) => ({ set, first }))
    .sort((a, b) => rank(a.set) - rank(b.set) || a.first - b.first)
    .map(({ set }) => {
      const topic = ordered.find((t) => t.id === set);
      const list = [...(bySet.get(set) ?? [])].sort((a, b) => position(topic, a) - position(topic, b));
      return { set, stickers: list, owned: list.filter((s) => owned.has(s.id)).length };
    });
}
