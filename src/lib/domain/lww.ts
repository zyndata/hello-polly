/** Last-writer-wins registers, ordered totally so that merging them is a join. */

import type { DeviceId, Instant, Lww } from '../types';

/** JSON with object keys sorted, so equal values always produce equal text. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v
  );
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Newer `t` wins, then larger `d`, then the larger canonical value (one device, one ms). */
export function compareLww<T>(a: Lww<T>, b: Lww<T>): number {
  return cmp(a.t, b.t) || cmp(a.d, b.d) || cmp(canonicalJson(a.v), canonicalJson(b.v));
}

export function mergeLww<T>(a: Lww<T>, b: Lww<T>): Lww<T> {
  return compareLww(a, b) >= 0 ? a : b;
}

export function lww<T>(v: T, t: Instant, d: DeviceId): Lww<T> {
  return { v, t, d };
}

/** The stamp of a default value: older than any real write, identical on every device. */
export const DEFAULT_STAMP = { t: '1970-01-01T00:00:00.000Z', d: '' } as const;
