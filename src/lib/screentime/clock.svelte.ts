/**
 * The screen-time ticker (PLAN.md "Screen time and the parent gate"; STATE.md decisions 91–94).
 *
 * While a screen of a particular child is on show and the page is visible, it ticks every
 * `TICK_MS`: the elapsed time goes into that child's session clock, whole minutes are written to
 * this device's progress (so they sync and add up across devices), and once a limit is reached
 * Polly falls asleep. The clocks are local only (`meta.screenTime`), never synced. Ticks run one
 * after another, so two of them never count the same time.
 */

import { db } from '../db';
import { childLimits } from '../domain/children';
import { addMinutes } from '../domain/progress';
import { minutesOn } from '../domain/rewards';
import { advance, resume, settle, wake, type SessionClock } from '../domain/screentime';
import { localDay } from '../domain/time';
import { change } from '../store';
import type { ChildId, ChildLimits, Day, FamilyFile } from '../types';

export const META_SCREEN_TIME = 'screenTime';
export const TICK_MS = 5_000;
/** How long the limits and other devices' minutes read from the family file stay fresh. */
const FACTS_MS = 30_000;

let clocks = $state<Record<ChildId, SessionClock>>({});
let loaded: Promise<void> | undefined;
/** How many screens of each child are on show (a screen may appear before the last one goes). */
const shown = new Map<ChildId, number>();
/** What the family file says, per child: limits and today's minutes over every device. */
const facts = new Map<ChildId, { limits: ChildLimits; minutesToday: number; day: Day; at: number }>();
let timer: ReturnType<typeof setInterval> | undefined;
/** The end of the time counted so far; `undefined` while nothing is counted. */
let lastTick: number | undefined;
let queue: Promise<void> = Promise.resolve();

const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
const onShow = () => [...shown].filter(([, n]) => n > 0).map(([child]) => child);

function load(): Promise<void> {
  loaded ??= (async () => {
    const row = await db().meta.get(META_SCREEN_TIME);
    if (row?.value && typeof row.value === 'object') clocks = { ...(row.value as Record<ChildId, SessionClock>), ...clocks };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  })();
  return loaded;
}

/** Runs `job` after every job queued before it. */
function enqueue(job: () => Promise<void>): Promise<void> {
  queue = queue.then(job).catch((error: unknown) => console.error(error));
  return queue;
}

function remember(child: ChildId, file: FamilyFile, day: Day, now: number) {
  facts.set(child, { limits: childLimits(file, child), minutesToday: minutesOn(file.progress[child], day), day, at: now });
}

async function factsFor(child: ChildId, day: Day, now: number) {
  const known = facts.get(child);
  if (known && known.day === day && now - known.at < FACTS_MS) return known;
  const file = (await db().family.get('local'))?.file;
  if (!file) return { limits: { dailyMinutes: null, sessionMinutes: null }, minutesToday: 0 };
  remember(child, file, day, now);
  return facts.get(child)!;
}

/** Counts the time since the last tick for every child on show, then checks the limits. */
async function step(): Promise<void> {
  const now = Date.now();
  const elapsed = lastTick === undefined ? 0 : now - lastTick;
  const counting = visible() && onShow().length > 0;
  lastTick = counting ? now : undefined;
  if (!counting) return;
  const day = localDay(new Date(now));
  for (const child of onShow()) {
    const { clock, minutes } = advance(resume(clocks[child], day, now), elapsed, now);
    if (minutes > 0) {
      const file = await change((f, _now, device) => addMinutes(f, child, device, day, minutes));
      remember(child, file, day, now);
    }
    const { limits, minutesToday } = await factsFor(child, day, now);
    clocks[child] = settle(clock, limits, minutesToday);
  }
  await db().meta.put({ key: META_SCREEN_TIME, value: $state.snapshot(clocks) });
}

function startTimer() {
  timer ??= setInterval(() => void enqueue(step), TICK_MS);
}

function stopTimer() {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
}

function onVisibility() {
  if (visible()) {
    // Hidden time is not play: counting restarts now (a long break starts a new session).
    void enqueue(async () => {
      if (onShow().length === 0) return;
      lastTick = Date.now();
      startTimer();
      await step();
    });
  } else {
    void enqueue(async () => {
      await step();
      lastTick = undefined;
      stopTimer();
    });
  }
}

export const screenTime = {
  /** Polly is asleep for this child: their screens are locked. */
  isAsleep(child: ChildId): boolean {
    return clocks[child]?.asleep === true;
  },

  /** A screen of `child` appears. Resolves once it is known whether Polly is asleep. */
  show(child: ChildId): Promise<void> {
    shown.set(child, (shown.get(child) ?? 0) + 1);
    // A new screen reads the family file afresh: limits or minutes may have come in by sync.
    facts.delete(child);
    return load().then(() =>
      enqueue(async () => {
        if (lastTick === undefined && visible()) lastTick = Date.now();
        startTimer();
        await step();
      })
    );
  },

  /** The screen of `child` goes; the time up to now still counts. */
  hide(child: ChildId): void {
    void enqueue(async () => {
      await step();
      const n = (shown.get(child) ?? 1) - 1;
      if (n > 0) shown.set(child, n);
      else shown.delete(child);
      if (onShow().length === 0) {
        lastTick = undefined;
        stopTimer();
      }
    });
  },

  /** The parent gate was passed: every sleeping Polly on this device wakes (decision 94). */
  wakeAll(): Promise<void> {
    return load().then(() =>
      enqueue(async () => {
        const asleep = Object.entries(clocks).filter(([, c]) => c.asleep);
        if (asleep.length === 0) return;
        const file = (await db().family.get('local'))?.file;
        const now = Date.now();
        for (const [child, clock] of asleep) {
          const day = clock.day;
          const limits = file ? childLimits(file, child) : { dailyMinutes: null, sessionMinutes: null };
          clocks[child] = wake(clock, limits, file ? minutesOn(file.progress[child], day) : 0, now);
          facts.delete(child);
        }
        await db().meta.put({ key: META_SCREEN_TIME, value: $state.snapshot(clocks) });
      })
    );
  }
};
