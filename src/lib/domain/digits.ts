/**
 * E2 *Cyferki* (PLAN.md "Exercises and games", the brief's example): four pictures and four
 * digit tiles 1–4. A digit stands for one of the words; tapping it says that word, and the
 * child then taps its picture. A right match takes the pair off the board; a wrong one never
 * does (decision 43: wiggle, the word again, the glow after the second miss).
 */

import type { WordId } from '../types';
import { react, type Reaction } from './exercise';
import { seededShuffle } from './random';

export const DIGITS = [1, 2, 3, 4] as const;
export type Digit = (typeof DIGITS)[number];

export interface DigitsBoard {
  /** Digit → word, four distinct words. */
  pairs: Record<Digit, WordId>;
  /** The pictures in screen order. */
  pictures: WordId[];
}

/** A board from four distinct words of `pool` (the first four of its shuffle), or none. */
export function digitsBoard(pool: readonly WordId[], seed: string): DigitsBoard | undefined {
  const chosen = seededShuffle([...new Set(pool)], `${seed}/words`).slice(0, DIGITS.length);
  if (chosen.length < DIGITS.length) return undefined;
  const pairs = Object.fromEntries(DIGITS.map((d, i) => [d, chosen[i]])) as Record<Digit, WordId>;
  return { pairs, pictures: seededShuffle(chosen, `${seed}/pictures`) };
}

export interface DigitsState {
  selected: Digit | null;
  /** Digits whose pair is off the board, in the order they were matched. */
  matched: Digit[];
  /** Wrong taps per digit. */
  misses: Partial<Record<Digit, number>>;
}

export const startDigits = (): DigitsState => ({ selected: null, matched: [], misses: {} });

/** Picks a digit (a matched one cannot be picked again). */
export function selectDigit(state: DigitsState, digit: Digit): DigitsState {
  return state.matched.includes(digit) ? state : { ...state, selected: digit };
}

export type DigitsOutcome =
  /** No digit picked, or the picture is already off the board: the picture just says its word. */
  | { kind: 'none' }
  | { kind: Reaction; digit: Digit; misses: number };

/** A tap on a picture. `misses` in the outcome counts the wrong taps for that digit so far. */
export function tapPicture(board: DigitsBoard, state: DigitsState, word: WordId): { state: DigitsState; outcome: DigitsOutcome } {
  const digit = state.selected;
  const gone = state.matched.some((d) => board.pairs[d] === word);
  if (digit === null || gone) return { state, outcome: { kind: 'none' } };
  const before = state.misses[digit] ?? 0;
  const reaction = react(before, board.pairs[digit] === word);
  if (reaction === 'correct') {
    return {
      state: { ...state, selected: null, matched: [...state.matched, digit] },
      outcome: { kind: 'correct', digit, misses: before }
    };
  }
  const misses = { ...state.misses, [digit]: before + 1 };
  return { state: { ...state, misses }, outcome: { kind: reaction, digit, misses: before + 1 } };
}

export const digitsDone = (state: DigitsState): boolean => state.matched.length === DIGITS.length;
