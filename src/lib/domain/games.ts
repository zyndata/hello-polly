/**
 * The game shelf (PLAN.md "A lesson": free play uses learned words only, and a game needs at
 * least four of them; STATE.md decisions 47–48).
 */

import type { ChildId, FamilyFile, ImageId, Word, WordId } from '../types';
import { childPlan } from './children';
import { wordStates } from './learning';
import type { Digit } from './digits';

export const GAME_IDS = ['listen', 'digits', 'memory'] as const;
export type GameId = (typeof GAME_IDS)[number];

export const isGameId = (id: string): id is GameId => (GAME_IDS as readonly string[]).includes(id);

/** Learned words a game needs before its tile opens. */
export const MIN_LEARNED = 4;

/** *Cyferki*'s digit tiles are the numbers topic's keycaps, so its pictures come from elsewhere. */
export const DIGIT_TOPIC = 'numbers';
export const digitImage = (digit: Digit): ImageId => `keycap-${digit}`;

/** The child's learned words that are not paused, in content order. */
export function learnedWords(file: FamilyFile, child: ChildId, words: readonly Pick<Word, 'id'>[]): WordId[] {
  const states = wordStates(file.progress[child]);
  const paused = new Set(childPlan(file, child).paused);
  return words.map((w) => w.id).filter((id) => !paused.has(id) && states.get(id)?.status === 'learned');
}

/** The words a game may use: every learned word, or for *Cyferki* those outside the numbers. */
export function gamePool(game: GameId, learned: readonly WordId[], words: readonly Pick<Word, 'id' | 'topic'>[]): WordId[] {
  if (game !== 'digits') return [...learned];
  const topicOf = new Map(words.map((w) => [w.id, w.topic]));
  return learned.filter((id) => topicOf.get(id) !== DIGIT_TOPIC);
}

export const gameOpen = (game: GameId, learned: readonly WordId[], words: readonly Pick<Word, 'id' | 'topic'>[]): boolean =>
  gamePool(game, learned, words).length >= MIN_LEARNED;
