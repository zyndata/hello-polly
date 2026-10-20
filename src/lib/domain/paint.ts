/**
 * E8 *Pokoloruj* (STATE.md decision 88): a grey picture of a learned thing and paint pots of
 * learned colours. Polly names the thing and a colour; the child taps that pot, then the
 * picture. A wrong pot never paints: it wiggles, and from the second miss the right pot glows.
 */

import type { Word, WordId } from '../types';
import { react, type Reaction } from './exercise';
import { seededShuffle } from './random';

export const PAINT_ROUNDS = 5;
export const PAINT_POTS = 3;

/** The paint of each colour word. Every word of the colours topic has one (unit-tested). */
export const PAINT: Readonly<Record<WordId, string>> = {
  'colours.red': '#e53935',
  'colours.blue': '#1e6fe5',
  'colours.yellow': '#fdd835',
  'colours.green': '#43a047',
  'colours.orange': '#fb8c00',
  'colours.purple': '#8e24aa',
  'colours.pink': '#f06292',
  'colours.brown': '#8d5a3b',
  'colours.black': '#333333',
  'colours.white': '#ffffff',
  'colours.grey': '#9e9e9e'
};

export interface PaintRound {
  /** The thing to paint. */
  thing: WordId;
  /** The colour asked for. */
  colour: WordId;
  /** The pots, the right one among them, in screen order. */
  pots: WordId[];
}

type WordInfo = Pick<Word, 'id' | 'en' | 'say'>;
const spoken = (w: WordInfo | undefined) => (w ? (w.say ?? w.en).trim().toLowerCase() : '');

/**
 * Five rounds. Things and colours each go round before repeating. A colour never sounds like
 * the thing (*orange* the fruit is never painted *orange*), and the pots never sound alike.
 */
export function paintRounds(colours: readonly WordId[], things: readonly WordId[], words: readonly WordInfo[], seed: string): PaintRound[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  const palette = colours.filter((id) => id in PAINT);
  if (palette.length === 0 || things.length === 0) return [];
  const thingOrder = seededShuffle(things, `${seed}/things`);
  const colourOrder = seededShuffle(palette, `${seed}/colours`);
  const rounds: PaintRound[] = [];
  for (let i = 0; i < PAINT_ROUNDS; i++) {
    const thing = thingOrder[i % thingOrder.length] as WordId;
    const sound = spoken(byId.get(thing));
    const usable = colourOrder.filter((c) => spoken(byId.get(c)) !== sound);
    const colour = (usable[i % Math.max(1, usable.length)] ?? colourOrder[0]) as WordId;
    const pots = [colour];
    for (const c of seededShuffle(usable, `${seed}/${i}/pots`)) {
      if (pots.length >= PAINT_POTS) break;
      if (!pots.some((p) => spoken(byId.get(p)) === spoken(byId.get(c)))) pots.push(c);
    }
    rounds.push({ thing, colour, pots: seededShuffle(pots, `${seed}/${i}/order`) });
  }
  return rounds;
}

export interface PaintState {
  /** The pot dipped into, if any. */
  pot: WordId | null;
  /** Wrong pots brought to the picture so far. */
  misses: number;
  painted: boolean;
}

export const startPaint = (): PaintState => ({ pot: null, misses: 0, painted: false });

export const choosePot = (state: PaintState, pot: WordId): PaintState => (state.painted ? state : { ...state, pot });

/** A tap on the picture: without a pot it only asks for one; with one it is an answer. */
export type PaintOutcome = { kind: 'no-pot' } | { kind: Reaction; misses: number };

export function paintPicture(round: PaintRound, state: PaintState): { state: PaintState; outcome: PaintOutcome } {
  if (state.painted || state.pot === null) return { state, outcome: { kind: 'no-pot' } };
  const reaction = react(state.misses, state.pot === round.colour);
  if (reaction === 'correct') return { state: { ...state, painted: true }, outcome: { kind: 'correct', misses: state.misses } };
  const misses = state.misses + 1;
  return { state: { ...state, pot: null, misses }, outcome: { kind: reaction, misses } };
}
