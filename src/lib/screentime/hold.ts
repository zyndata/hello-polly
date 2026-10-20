/**
 * "The current exercise finishes" (STATE.md decision 93): a child screen that is in the middle
 * of something (a lesson step, a game, a story, a chest) holds the lock off until it is done.
 * The route's guard (`ChildGuard.svelte`) provides the context; the screen asks for it once,
 * while it is created.
 */

import { getContext, setContext } from 'svelte';

const KEY = Symbol('screen-hold');

export interface ScreenHold {
  /** The screen is done: if Polly is asleep, the lock may show now. */
  release(): void;
}

interface HoldContext {
  set(holding: boolean): void;
}

export function provideHold(set: (holding: boolean) => void): void {
  setContext<HoldContext>(KEY, { set });
}

/** Holds the lock off from now until `release()` or until the screen goes. */
export function holdScreen(): ScreenHold {
  const context = getContext<HoldContext | undefined>(KEY);
  context?.set(true);
  return { release: () => context?.set(false) };
}
