/**
 * The 🐢/🐇 choice on child screens. Per session, shared by every child screen; it starts at
 * the family's `defaultSpeed` and is not stored (STATE.md decision 27).
 */

import type { Speed } from '../types';

let current = $state<Speed>('slow');
let chosen = false;

export const speed = {
  get value(): Speed {
    return current;
  },
  /** The child (or a parent) picked a speed: it holds until the page is reloaded. */
  set(value: Speed): void {
    current = value;
    chosen = true;
  },
  /** The family default, unless a speed was already picked this session. */
  setDefault(value: Speed): void {
    if (!chosen) current = value;
  }
};
