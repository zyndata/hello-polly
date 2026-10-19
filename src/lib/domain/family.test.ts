import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, clampRate, emptyFamily, readSettings, setSetting } from './family';
import { mergeFamily } from './merge';

const T1 = '2026-10-19T10:00:00.000Z';
const T2 = '2026-10-19T10:00:05.000Z';

describe('family settings', () => {
  it('reads the defaults from an empty family; British by default', () => {
    expect(readSettings(emptyFamily('f'))).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.accent).toBe('en-GB');
  });

  it('writes one setting as an Lww register stamped by this device', () => {
    const file = setSetting(emptyFamily('f'), 'accent', 'en-US', T1, 'dev-a');
    expect(file.settings.accent).toEqual({ v: 'en-US', t: T1, d: 'dev-a' });
    expect(readSettings(file).accent).toBe('en-US');
    expect(file.settings.slowRate).toEqual(emptyFamily('f').settings.slowRate);
  });

  it('clamps rates on write and on read', () => {
    expect(clampRate('slowRate', 0.1)).toBe(0.4);
    expect(clampRate('slowRate', 0.9)).toBe(0.8);
    expect(clampRate('normalRate', 2)).toBe(1.1);
    expect(clampRate('normalRate', Number.NaN)).toBe(0.9);
    expect(setSetting(emptyFamily('f'), 'slowRate', 0.2, T1, 'd').settings.slowRate.v).toBe(0.4);
    const file = emptyFamily('f');
    file.settings.normalRate = { v: 5, t: T1, d: 'd' };
    expect(readSettings(file).normalRate).toBe(1.1);
  });

  it('a local change beats a register stamped by a clock running ahead', () => {
    const ahead = setSetting(emptyFamily('f'), 'accent', 'en-US', T2, 'dev-b');
    const mine = setSetting(ahead, 'accent', 'en-GB', T1, 'dev-a');
    expect(mine.settings.accent.t > T2).toBe(true);
    expect(readSettings(mergeFamily(ahead, mine)).accent).toBe('en-GB');
  });

  it('the later of two devices’ changes wins the merge', () => {
    const a = setSetting(emptyFamily('f'), 'slowRepeatTwice', true, T1, 'dev-a');
    const b = setSetting(emptyFamily('f'), 'slowRepeatTwice', false, T2, 'dev-b');
    expect(readSettings(mergeFamily(a, b)).slowRepeatTwice).toBe(false);
    expect(readSettings(mergeFamily(b, a)).slowRepeatTwice).toBe(false);
  });
});
