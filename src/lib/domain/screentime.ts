/**
 * The session clock behind the screen-time limits (PLAN.md "Screen time and the parent gate";
 * STATE.md decisions 91–94). Pure: the ticker in `src/lib/screentime/` feeds it elapsed time and
 * stores it locally; the minutes it hands back are written to this device's progress.
 */

import type { ChildLimits, Day } from '../types';

const MINUTE_MS = 60_000;

/** A break at least this long away from the child's screens starts a new session. */
export const SESSION_BREAK_MS = 30 * MINUTE_MS;
/** More than this between two ticks means the device was suspended: it counts for nothing. */
export const MAX_TICK_GAP_MS = 2 * MINUTE_MS;

/** One child's clock on this device. Local only, never synced. */
export interface SessionClock {
  /** The local day the clock belongs to. */
  day: Day;
  /** Play time in the current session. */
  sessionMs: number;
  /** Play time today not yet written to the family file as whole minutes. */
  pendingMs: number;
  /** When this child's screens were last on show (epoch ms). */
  lastSeen: number;
  /** Polly is asleep: the child's screens are locked until the gate or the next day. */
  asleep: boolean;
  /** The gate woke Polly from the daily limit: it does not apply again on `day`. */
  waived: boolean;
}

export const freshClock = (day: Day, now: number): SessionClock => ({
  day,
  sessionMs: 0,
  pendingMs: 0,
  lastSeen: now,
  asleep: false,
  waived: false
});

/**
 * The clock as the child's screens come back on show at `now`: a new day starts afresh, and a
 * long break starts a new session, unless Polly is asleep (only the gate or the day wakes her).
 */
export function resume(clock: SessionClock | undefined, day: Day, now: number): SessionClock {
  if (!clock || clock.day !== day) return freshClock(day, now);
  if (!clock.asleep && now - clock.lastSeen >= SESSION_BREAK_MS) return { ...clock, sessionMs: 0, lastSeen: now };
  return { ...clock, lastSeen: now };
}

/**
 * `elapsedMs` of play ending at `now`, and the whole minutes it completes, to be written to the
 * family file. Nothing counts while Polly sleeps, nor across a suspended device's gap.
 */
export function advance(clock: SessionClock, elapsedMs: number, now: number): { clock: SessionClock; minutes: number } {
  if (clock.asleep || !(elapsedMs > 0) || elapsedMs > MAX_TICK_GAP_MS) return { clock: { ...clock, lastSeen: now }, minutes: 0 };
  const pending = clock.pendingMs + elapsedMs;
  const minutes = Math.floor(pending / MINUTE_MS);
  return {
    clock: { ...clock, sessionMs: clock.sessionMs + elapsedMs, pendingMs: pending - minutes * MINUTE_MS, lastSeen: now },
    minutes
  };
}

export type TimeUp = 'session' | 'daily';

/**
 * Which limit is reached, if any. `minutesToday` is the family file's total for the day over
 * every device (this one's written minutes included); the clock adds what it has not written.
 */
export function timeUp(clock: SessionClock, limits: ChildLimits, minutesToday: number): TimeUp | undefined {
  if (limits.sessionMinutes !== null && clock.sessionMs >= limits.sessionMinutes * MINUTE_MS) return 'session';
  if (limits.dailyMinutes !== null && !clock.waived && minutesToday * MINUTE_MS + clock.pendingMs >= limits.dailyMinutes * MINUTE_MS) {
    return 'daily';
  }
  return undefined;
}

/** Polly asleep once a limit is reached; she stays asleep until `wake` or the next day. */
export function settle(clock: SessionClock, limits: ChildLimits, minutesToday: number): SessionClock {
  if (clock.asleep || timeUp(clock, limits, minutesToday) === undefined) return clock;
  return { ...clock, asleep: true };
}

/**
 * The gate passed: a sleeping Polly wakes into a fresh session, and if the daily limit is what
 * put her to sleep, it is waived for the rest of the day (STATE.md decision 94).
 */
export function wake(clock: SessionClock, limits: ChildLimits, minutesToday: number, now: number): SessionClock {
  if (!clock.asleep) return clock;
  const daily = timeUp({ ...clock, sessionMs: 0, waived: false }, limits, minutesToday) === 'daily';
  return { ...clock, asleep: false, sessionMs: 0, lastSeen: now, waived: clock.waived || daily };
}
