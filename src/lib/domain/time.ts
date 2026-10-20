/** Calendar days as `YYYY-MM-DD` strings, which sort and compare as text. */

import type { Day } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

/** The local calendar day of an instant (the child's day, not UTC's). */
export function localDay(date: Date): Day {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const toUtc = (day: Day) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const MS_PER_DAY = 86_400_000;

/** `day` moved by `n` days. Pure calendar arithmetic, immune to daylight-saving changes. */
export function addDays(day: Day, n: number): Day {
  const d = new Date(toUtc(day) + n * MS_PER_DAY);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: Day, b: Day): number {
  return Math.round((toUtc(b) - toUtc(a)) / MS_PER_DAY);
}

/** The day of the week, Monday first: 0 is Monday, 6 is Sunday. */
export function weekday(day: Day): number {
  return (new Date(toUtc(day)).getUTCDay() + 6) % 7;
}
