/**
 * E6 *Gdzie jest…?* (I spy; STATE.md decision 88): one scene with 5–8 learned things, and five
 * of them asked for in turn. The scene is laid out once, so it stays put between questions.
 */

import type { SceneItem, Word, WordId } from '../types';
import { pickChoices } from './exercise';
import { hashString, mulberry32, seededShuffle } from './random';

export const SPY_MAX_ITEMS = 8;
export const SPY_ROUNDS = 5;
/**
 * An item's width, in percent of the scene's width. The scene draws each item's tap area a
 * little wider than its picture, so it stays ≥ 72 px on a phone.
 */
export const SPY_ITEM_SIZE = 22;

/** Eight places in a 100 × 75 scene, in three rows that do not overlap (x, y in percent). */
const SLOTS: readonly (readonly [number, number])[] = [
  [16, 16],
  [50, 16],
  [84, 16],
  [33, 50],
  [67, 50],
  [16, 84],
  [50, 84],
  [84, 84]
];
/** How far a place may move sideways and up or down, in percent, so two games do not look the same. */
const JITTER_X = 3;
const JITTER_Y = 1;

export interface SpyBoard {
  items: SceneItem[];
  /** The words asked for, in order. */
  targets: WordId[];
}

type WordInfo = Pick<Word, 'id' | 'en' | 'say' | 'image' | 'topic'>;

/**
 * Up to eight learned things that neither look nor sound alike, placed in the scene, and the
 * five asked for. With fewer than `SPY_ROUNDS` things, some are asked for twice.
 */
export function spyBoard(learned: readonly WordId[], words: readonly WordInfo[], seed: string): SpyBoard {
  const byId = new Map(words.map((w) => [w.id, w]));
  const [first] = seededShuffle(learned, `${seed}/first`);
  if (first === undefined) return { items: [], targets: [] };
  const chosen = pickChoices(first, SPY_MAX_ITEMS, [learned], `${seed}/items`, (id) => byId.get(id));
  const places = seededShuffle(SLOTS, `${seed}/places`);
  const next = mulberry32(hashString(`${seed}/jitter`));
  const jitter = (by: number) => Math.round((next() * 2 - 1) * by);
  const items = chosen.map((id, i): SceneItem => {
    const [x, y] = places[i] as readonly [number, number];
    return { word: id, image: byId.get(id)?.image ?? '', x: x + jitter(JITTER_X), y: y + jitter(JITTER_Y), size: SPY_ITEM_SIZE };
  });
  const order = seededShuffle(chosen, `${seed}/targets`);
  const targets = Array.from({ length: SPY_ROUNDS }, (_, i) => order[i % order.length] as WordId);
  return { items, targets };
}
