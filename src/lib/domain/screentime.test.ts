import { describe, expect, it } from 'vitest';
import { MAX_TICK_GAP_MS, SESSION_BREAK_MS, advance, freshClock, resume, settle, timeUp, wake, type SessionClock } from './screentime';

const MIN = 60_000;
const DAY = '2026-10-20';
const limits = (dailyMinutes: number | null, sessionMinutes: number | null) => ({ dailyMinutes, sessionMinutes });

/** Plays `ms` in ticks of 5 s from `start`, as the ticker does; returns the clock and the minutes written. */
function play(clock: SessionClock, ms: number, start = clock.lastSeen): { clock: SessionClock; written: number } {
  let written = 0;
  let now = start;
  for (let left = ms; left > 0; left -= 5_000) {
    const step = Math.min(5_000, left);
    now += step;
    const r = advance(clock, step, now);
    clock = r.clock;
    written += r.minutes;
  }
  return { clock, written };
}

describe('the session clock', () => {
  it('writes whole minutes and keeps the rest for later', () => {
    const { clock, written } = play(freshClock(DAY, 0), 150_000);
    expect(written).toBe(2);
    expect(clock.pendingMs).toBe(30_000);
    expect(clock.sessionMs).toBe(150_000);
    // Two short sessions still add up within the day.
    const later = resume(clock, DAY, clock.lastSeen + SESSION_BREAK_MS);
    expect(later.sessionMs).toBe(0);
    expect(play(later, 30_000).written).toBe(1);
  });

  it('counts nothing across a suspended gap, nor while Polly sleeps', () => {
    const clock = freshClock(DAY, 0);
    expect(advance(clock, MAX_TICK_GAP_MS + 1, MAX_TICK_GAP_MS + 1)).toEqual({ clock: { ...clock, lastSeen: MAX_TICK_GAP_MS + 1 }, minutes: 0 });
    expect(advance(clock, MAX_TICK_GAP_MS, MAX_TICK_GAP_MS).minutes).toBe(2);
    expect(advance({ ...clock, asleep: true }, 30_000, 30_000).clock.sessionMs).toBe(0);
    expect(advance(clock, -5, 0).minutes).toBe(0);
  });

  it('a new day starts afresh; a long break starts a new session, unless Polly is asleep', () => {
    const played = { ...play(freshClock(DAY, 0), 5 * MIN).clock, waived: true };
    expect(resume(played, '2026-10-21', played.lastSeen + 1)).toEqual(freshClock('2026-10-21', played.lastSeen + 1));
    expect(resume(played, DAY, played.lastSeen + SESSION_BREAK_MS - 1).sessionMs).toBe(5 * MIN);
    expect(resume(played, DAY, played.lastSeen + SESSION_BREAK_MS)).toMatchObject({ sessionMs: 0, waived: true });
    const asleep = { ...played, asleep: true };
    expect(resume(asleep, DAY, played.lastSeen + 3 * SESSION_BREAK_MS)).toMatchObject({ asleep: true, sessionMs: 5 * MIN });
    expect(resume(asleep, '2026-10-21', 0).asleep).toBe(false);
    expect(resume(undefined, DAY, 7)).toEqual(freshClock(DAY, 7));
  });

  it('the session limit is the play time of this session', () => {
    const { clock } = play(freshClock(DAY, 0), MIN - 5_000);
    expect(timeUp(clock, limits(null, 1), 0)).toBeUndefined();
    expect(timeUp(play(clock, 5_000).clock, limits(null, 1), 0)).toBe('session');
    expect(timeUp(play(clock, 5_000).clock, limits(null, null), 0)).toBeUndefined();
  });

  it("the daily limit adds every device's written minutes to this one's unwritten time", () => {
    const clock = { ...freshClock(DAY, 0), pendingMs: 59_000 };
    expect(timeUp(clock, limits(15, null), 14)).toBeUndefined();
    expect(timeUp({ ...clock, pendingMs: MIN }, limits(15, null), 14)).toBe('daily');
    expect(timeUp(freshClock(DAY, 0), limits(15, null), 20)).toBe('daily');
    expect(timeUp(freshClock(DAY, 0), limits(null, 10), 500)).toBeUndefined();
    expect(timeUp({ ...freshClock(DAY, 0), waived: true }, limits(15, null), 20)).toBeUndefined();
  });

  it('once asleep, Polly stays asleep: a raised limit does not wake her', () => {
    const tired = play(freshClock(DAY, 0), MIN).clock;
    const asleep = settle(tired, limits(null, 1), 0);
    expect(asleep.asleep).toBe(true);
    expect(settle(asleep, limits(null, 30), 0)).toBe(asleep);
    expect(settle(tired, limits(null, 2), 0)).toBe(tired);
  });

  it('the gate wakes Polly into a fresh session, and waives the daily limit only when it was the daily one', () => {
    const fromSession = settle(play(freshClock(DAY, 0), MIN).clock, limits(15, 1), 1);
    const woken = wake(fromSession, limits(15, 1), 1, 99);
    expect(woken).toMatchObject({ asleep: false, sessionMs: 0, waived: false, lastSeen: 99 });
    // The session limit applies again from the new session.
    expect(timeUp(play(woken, MIN).clock, limits(15, 1), 2)).toBe('session');

    const fromDay = settle(freshClock(DAY, 0), limits(15, 10), 15);
    expect(fromDay.asleep).toBe(true);
    const morning = wake(fromDay, limits(15, 10), 15, 5);
    expect(morning).toMatchObject({ asleep: false, waived: true });
    expect(settle(morning, limits(15, 10), 40).asleep).toBe(false);
    expect(settle(play(morning, 10 * MIN).clock, limits(15, 10), 40).asleep).toBe(true);
    // Not asleep: the gate changes nothing.
    const awake = freshClock(DAY, 0);
    expect(wake(awake, limits(15, 10), 20, 5)).toBe(awake);
  });
});
