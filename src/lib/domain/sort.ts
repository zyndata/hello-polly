/**
 * E9 *Kosze* (STATE.md decisions 88–89): two baskets, each a topic with ≥ 3 learned words, and
 * six pictures to drop into them one at a time. A wrong basket wiggles and the picture stays;
 * from the second miss the right basket glows. Nothing is recorded but the stars: it sorts
 * pictures, it does not test a heard word (like *Memory*).
 */

import type { TopicId, Word, WordId } from '../types';
import { react, type Reaction } from './exercise';
import { basketTopics, byTopic } from './games';
import { seededShuffle } from './random';

export const SORT_PER_BASKET = 3;

export interface SortBoard {
  /** The two topics, in screen order (left, right). */
  baskets: [TopicId, TopicId];
  /** The pictures, in the order they come. */
  items: WordId[];
  /** Picture → its basket. */
  home: Record<WordId, TopicId>;
}

export function sortBoard(learned: readonly WordId[], words: readonly Pick<Word, 'id' | 'topic'>[], seed: string): SortBoard | undefined {
  const [a, b] = seededShuffle(basketTopics(learned, words), `${seed}/topics`);
  if (a === undefined || b === undefined) return undefined;
  const groups = byTopic(learned, words);
  const home: Record<WordId, TopicId> = {};
  const items: WordId[] = [];
  for (const topic of [a, b]) {
    for (const id of seededShuffle(groups.get(topic) ?? [], `${seed}/${topic}`).slice(0, SORT_PER_BASKET)) {
      home[id] = topic;
      items.push(id);
    }
  }
  return { baskets: seededShuffle([a, b], `${seed}/sides`) as [TopicId, TopicId], items: seededShuffle(items, `${seed}/items`), home };
}

export interface SortState {
  /** The picture on show. */
  index: number;
  /** Wrong baskets for the picture on show. */
  misses: number;
}

export const startSort = (): SortState => ({ index: 0, misses: 0 });

/** A tap on a basket for the picture on show. `misses` in the outcome are those before a right tap. */
export function dropIn(board: SortBoard, state: SortState, basket: TopicId): { state: SortState; outcome: { kind: Reaction; misses: number } } {
  const item = board.items[state.index];
  const reaction = react(state.misses, item !== undefined && board.home[item] === basket);
  if (reaction === 'correct') return { state: { index: state.index + 1, misses: 0 }, outcome: { kind: 'correct', misses: state.misses } };
  return { state: { ...state, misses: state.misses + 1 }, outcome: { kind: reaction, misses: state.misses + 1 } };
}

export const sortDone = (board: SortBoard, state: SortState): boolean => state.index >= board.items.length;
