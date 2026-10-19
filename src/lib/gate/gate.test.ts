import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../domain/random';
import { FIRST_COOLDOWN_MS, MAX_COOLDOWN_MS, cooldownMs, drawNumber, erase, isLocked, newGate, polishNumber, press } from './gate';

/** A random source that returns the given values in turn. */
const fixed = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] as number;
};

const typeNumber = (gate: ReturnType<typeof newGate>, n: number, now: number, random = fixed(0.5)) =>
  press(press(gate, Math.floor(n / 10), now, random), n % 10, now, random);

describe('parent gate', () => {
  it('draws numbers from 10 to 99, and a different one after a miss', () => {
    expect(drawNumber(fixed(0))).toBe(10);
    expect(drawNumber(fixed(0.999999))).toBe(99);
    expect(drawNumber(fixed(0), 10)).toBe(11);
    expect(drawNumber(fixed(0.999999), 99)).toBe(10);
    const random = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const n = drawNumber(random);
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(99);
    }
  });

  it('opens on the right two digits', () => {
    const gate = newGate(fixed(37 / 90 + 0.001)); // 10 + floor(0.412 × 90) = 47
    expect(gate.target).toBe(47);
    const half = press(gate, 4, 0, Math.random);
    expect(half.entered).toBe('4');
    expect(half.passed).toBe(false);
    expect(press(half, 7, 0, Math.random).passed).toBe(true);
  });

  it('on a miss, draws a new number, clears the entry and locks the keypad, longer each time', () => {
    let gate = newGate(fixed(0)); // 10
    gate = typeNumber(gate, 12, 1000, fixed(0.5));
    expect(gate).toMatchObject({ entered: '', misses: 1, lockedUntil: 1000 + FIRST_COOLDOWN_MS, passed: false });
    expect(gate.target).not.toBe(10);
    expect(isLocked(gate, 1000 + FIRST_COOLDOWN_MS - 1)).toBe(true);
    expect(isLocked(gate, 1000 + FIRST_COOLDOWN_MS)).toBe(false);

    // Presses while locked change nothing, not even the right answer.
    const target = gate.target;
    expect(typeNumber(gate, target, 1500)).toBe(gate);

    const later = 1000 + FIRST_COOLDOWN_MS;
    gate = typeNumber(gate, target === 10 ? 11 : 10, later);
    expect(gate.misses).toBe(2);
    expect(gate.lockedUntil).toBe(later + 2 * FIRST_COOLDOWN_MS);
  });

  it('caps the pause at a minute', () => {
    expect(cooldownMs(0)).toBe(0);
    expect(cooldownMs(1)).toBe(FIRST_COOLDOWN_MS);
    expect(cooldownMs(2)).toBe(2 * FIRST_COOLDOWN_MS);
    expect(cooldownMs(3)).toBe(4 * FIRST_COOLDOWN_MS);
    expect(cooldownMs(5)).toBe(MAX_COOLDOWN_MS);
    expect(cooldownMs(50)).toBe(MAX_COOLDOWN_MS);
  });

  it('erases a digit, ignores anything that is not a digit, and stays open once passed', () => {
    let gate = press(newGate(fixed(0)), 1, 0, Math.random);
    gate = erase(gate, 0);
    expect(gate.entered).toBe('');
    expect(press(gate, 10, 0, Math.random)).toBe(gate);
    expect(press(gate, -1, 0, Math.random)).toBe(gate);
    const open = typeNumber(gate, 10, 0);
    expect(open.passed).toBe(true);
    expect(press(open, 3, 0, Math.random)).toBe(open);
  });

  /** The share of 2000 seeded bursts of 50 random keypad presses, `gap` ms apart, that open the gate. */
  function openedShare(gap: number): number {
    let opened = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const random = mulberry32(seed);
      let gate = newGate(random);
      for (let tap = 0; tap < 50 && !gate.passed; tap++) gate = press(gate, Math.floor(random() * 10), tap * gap, random);
      if (gate.passed) opened++;
    }
    return opened / 2000;
  }

  it('lets 50 random taps through only with the luck of two or three guesses', () => {
    // Each guess is 1 in 90. Fast taps (7.5 s): the 5 s pause leaves room for 2 guesses.
    expect(openedShare(150)).toBeLessThan(0.025);
    // Slow taps (20 s): 5 s, then 10 s of pause, so 3 guesses.
    expect(openedShare(400)).toBeLessThan(0.035);
  });

  it('writes numbers in Polish words', () => {
    expect(polishNumber(10)).toBe('dziesięć');
    expect(polishNumber(11)).toBe('jedenaście');
    expect(polishNumber(19)).toBe('dziewiętnaście');
    expect(polishNumber(20)).toBe('dwadzieścia');
    expect(polishNumber(47)).toBe('czterdzieści siedem');
    expect(polishNumber(55)).toBe('pięćdziesiąt pięć');
    expect(polishNumber(99)).toBe('dziewięćdziesiąt dziewięć');
    expect(() => polishNumber(9)).toThrow(RangeError);
    expect(() => polishNumber(100)).toThrow(RangeError);
    const all = new Set(Array.from({ length: 90 }, (_, i) => polishNumber(i + 10)));
    expect(all.size).toBe(90);
  });
});
