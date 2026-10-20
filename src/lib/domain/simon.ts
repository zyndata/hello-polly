/**
 * E7 *Polly mówi* (Simon says; STATE.md decisions 83, 88): Polly names a body part, shows it,
 * and the child does the same and taps ✅. Ungraded: nothing is recorded but the stars.
 */

import type { WordId } from '../types';
import { seededShuffle } from './random';

export const SIMON_COMMANDS = 5;

/** The body parts Polly asks for, every learned one before any repeats, never twice in a row. */
export function simonCommands(pool: readonly WordId[], seed: string, count = SIMON_COMMANDS): WordId[] {
  const unique = [...new Set(pool)];
  if (unique.length === 0) return [];
  const out: WordId[] = [];
  for (let lap = 0; out.length < count; lap++) {
    let order = seededShuffle(unique, `${seed}/${lap}`);
    if (unique.length > 1 && order[0] === out.at(-1)) order = [...order.slice(1), order[0] as WordId];
    out.push(...order);
  }
  return out.slice(0, count);
}
