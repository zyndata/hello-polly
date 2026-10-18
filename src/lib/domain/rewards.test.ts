import { describe, expect, it } from 'vitest';
import type { DeviceProgress } from '../types';
import { emptyProgress } from './family';
import { album, chestState, chestsOpened, minutesOn, totalStars } from './rewards';

const p = (extra: Partial<DeviceProgress>): DeviceProgress => ({ ...emptyProgress(), ...extra });
const opening = (...stickers: string[]) => ({ at: '2026-10-18T10:00:00.000Z', stickers });

const child = {
  phone: p({ stars: 20, chestsOpened: { e1: opening('s.cat', 's.dog') }, minutes: { '2026-10-18': 6, '2026-10-17': 9 } }),
  tablet: p({ stars: 14, chestsOpened: { e2: opening('s.dog', 's.ship') }, minutes: { '2026-10-18': 4 } })
};

describe('rewards', () => {
  it('total stars sum every device', () => {
    expect(totalStars(child)).toBe(34);
    expect(totalStars(undefined)).toBe(0);
  });

  it('chests: earned = floor(stars / starsPerChest), minus the opened ones on every device', () => {
    expect(chestsOpened(child)).toBe(2);
    expect(chestState(child, 15)).toEqual({ unopened: 0, meter: 4 });
    expect(chestState(child, 10)).toEqual({ unopened: 1, meter: 4 });
    expect(chestState(child, 5)).toEqual({ unopened: 4, meter: 4 });
  });

  it('raising starsPerChest never makes unopened chests negative', () => {
    expect(chestState(child, 40)).toEqual({ unopened: 0, meter: 34 });
  });

  it('a nonsense starsPerChest is treated as 1', () => {
    expect(chestState(child, 0).unopened).toBe(32);
  });

  it('the album is the union of every opening on every device', () => {
    expect([...album(child)].sort()).toEqual(['s.cat', 's.dog', 's.ship']);
  });

  it('minutes on a day sum every device', () => {
    expect(minutesOn(child, '2026-10-18')).toBe(10);
    expect(minutesOn(child, '2026-10-17')).toBe(9);
    expect(minutesOn(child, '2026-10-16')).toBe(0);
  });
});
