/**
 * The unlock gesture (PLAN.md "Speech": speech starts only after a user gesture). Call it at
 * the top of a tap handler, before anything speaks or plays: the start screen's tap, or a
 * parent's tap on a play button. Idempotent.
 */

import { sounds } from './sound/effects';
import { speaker } from './speech';

export function unlock(): void {
  speaker().unlock();
  sounds().unlock();
}
