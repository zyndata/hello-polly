/**
 * The parent gate (PLAN.md "Screen time and the parent gate"; STATE.md decision 37): a number
 * from 10 to 99 written in Polish words, typed on a keypad. A pre-reader cannot read it; an
 * adult needs two seconds. The second digit checks the answer. A miss draws a new number and
 * locks the keypad for a while, doubling with each further miss, so random tapping gets very
 * few tries. It is a child-proof lock, not a security boundary.
 *
 * Pure: time and randomness come in as arguments.
 */

export const MIN_NUMBER = 10;
export const MAX_NUMBER = 99;
export const FIRST_COOLDOWN_MS = 5000;
export const MAX_COOLDOWN_MS = 60_000;

export interface GateState {
  target: number;
  /** Digits typed so far (0–1 of them; the second one checks). */
  entered: string;
  /** Misses since the gate was shown. */
  misses: number;
  /** Until this time (ms) the keypad ignores input. */
  lockedUntil: number;
  passed: boolean;
}

/** A number in [10, 99] from a `Math.random`-like source. */
export function drawNumber(random: () => number, avoid?: number): number {
  const span = MAX_NUMBER - MIN_NUMBER + 1;
  let n = MIN_NUMBER + Math.floor(random() * span);
  // A new number after a miss is never the same one again.
  if (n === avoid) n = n === MAX_NUMBER ? MIN_NUMBER : n + 1;
  return n;
}

export function newGate(random: () => number): GateState {
  return { target: drawNumber(random), entered: '', misses: 0, lockedUntil: 0, passed: false };
}

export const cooldownMs = (misses: number): number =>
  misses <= 0 ? 0 : Math.min(MAX_COOLDOWN_MS, FIRST_COOLDOWN_MS * 2 ** (misses - 1));

export const isLocked = (gate: GateState, now: number): boolean => now < gate.lockedUntil;

/** One keypad press. Ignored while locked or once passed. */
export function press(gate: GateState, digit: number, now: number, random: () => number): GateState {
  if (gate.passed || isLocked(gate, now) || !Number.isInteger(digit) || digit < 0 || digit > 9) return gate;
  const entered = gate.entered + String(digit);
  if (entered.length < 2) return { ...gate, entered };
  if (Number(entered) === gate.target) return { ...gate, entered, passed: true };
  const misses = gate.misses + 1;
  return {
    target: drawNumber(random, gate.target),
    entered: '',
    misses,
    lockedUntil: now + cooldownMs(misses),
    passed: false
  };
}

/** The last typed digit removed. */
export function erase(gate: GateState, now: number): GateState {
  if (gate.passed || isLocked(gate, now)) return gate;
  return { ...gate, entered: gate.entered.slice(0, -1) };
}

const UNITS = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'];
const TEENS = [
  'dziesięć',
  'jedenaście',
  'dwanaście',
  'trzynaście',
  'czternaście',
  'piętnaście',
  'szesnaście',
  'siedemnaście',
  'osiemnaście',
  'dziewiętnaście'
];
const TENS = [
  '',
  '',
  'dwadzieścia',
  'trzydzieści',
  'czterdzieści',
  'pięćdziesiąt',
  'sześćdziesiąt',
  'siedemdziesiąt',
  'osiemdziesiąt',
  'dziewięćdziesiąt'
];

/** 10–99 in Polish words: 47 → „czterdzieści siedem”. */
export function polishNumber(n: number): string {
  if (!Number.isInteger(n) || n < MIN_NUMBER || n > MAX_NUMBER) throw new RangeError(`Not a two-digit number: ${n}`);
  if (n < 20) return TEENS[n - 10] as string;
  const unit = UNITS[n % 10] as string;
  return unit ? `${TENS[Math.floor(n / 10)]} ${unit}` : (TENS[n / 10] as string);
}
