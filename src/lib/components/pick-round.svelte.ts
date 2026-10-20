/**
 * One "hear a word, tap its picture" round, whatever the pictures look like (STATE.md decisions
 * 43, 88): E1's grid, E4's bubbles, E5's food for Polly, E6's scene. Polly asks with a Polish
 * prompt and the English word; every tap says the tapped picture's word. A right tap chimes and
 * praises in English, then `onsolved` follows by itself. A wrong tap wiggles and Polly asks
 * again; from the second miss on, the right picture glows. Nothing is taken away or marked wrong.
 */

import type { Mood } from './PollyBuddy.svelte';
import { praise, prompt, word as wordById, type PromptId } from '../content';
import { react } from '../domain/exercise';
import { sounds, type Effect } from '../sound/effects';
import { promptSegments, speaker, spokenForm, type Segment } from '../speech';
import { speed } from '../speech/speed.svelte';
import { unlock } from '../unlock';
import type { Word, WordId } from '../types';

/** The praise has this long at least before the next step. */
export const AFTER_CORRECT_MS = 500;

/** Rotates through the praise list, so a run of right answers is not one word over and over. */
let praised = 0;
export const nextPraise = (): string => praise[praised++ % praise.length] ?? 'Great!';

export interface PickRoundOptions {
  target: WordId;
  /** The question, with `{word}` for the target („Gdzie jest {word}?”). */
  question?: PromptId;
  /** Called once, after the praise: the wrong taps before the right one. */
  onsolved: (misses: number) => void;
  onmood?: (mood: Mood) => void;
  /** The sound of a right tap. */
  rightSound?: Effect;
}

export class PickRound {
  misses = $state(0);
  solved = $state(false);
  wiggles = $state<Record<WordId, number>>({});
  private alive = true;

  constructor(private readonly options: PickRoundOptions) {}

  get target(): WordId {
    return this.options.target;
  }

  get goal(): Word | undefined {
    return wordById(this.options.target);
  }

  /** From the second miss on, the right picture glows until it is tapped. */
  get glowing(): boolean {
    return this.misses >= 2 && !this.solved;
  }

  wiggling = (id: WordId): number => this.wiggles[id] ?? 0;

  /** Polly asks (again). `lead` is said first, in the same breath. */
  ask(lead: Segment[] = []): void {
    const goal = this.goal;
    if (!goal) return;
    void speaker().saySegments([...lead, ...promptSegments(prompt(this.options.question ?? 'pick.find'), goal)], speed.value);
  }

  /** Stops the round answering: its screen is gone. */
  destroy(): void {
    this.alive = false;
  }

  /** A fresh round for the next target (the options' `target` getter now gives the new one). */
  reset(): void {
    this.misses = 0;
    this.solved = false;
    this.wiggles = {};
  }

  async tap(id: WordId): Promise<void> {
    unlock();
    const w = wordById(id);
    const goal = this.goal;
    if (this.solved || !goal || !w) return;
    const reaction = react(this.misses, id === this.options.target);
    if (reaction === 'correct') {
      this.solved = true;
      sounds().play(this.options.rightSound ?? 'correct');
      this.options.onmood?.('happy');
      const minimum = new Promise((r) => setTimeout(r, AFTER_CORRECT_MS));
      await speaker().sayWord(w, speed.value);
      if (!this.alive) return;
      await Promise.all([speaker().speak(nextPraise(), { lang: 'en', speed: 'normal' }), minimum]);
      if (this.alive) this.options.onsolved(this.misses);
      return;
    }
    this.misses += 1;
    this.wiggles[id] = (this.wiggles[id] ?? 0) + 1;
    sounds().play('wiggle');
    this.options.onmood?.('think');
    void speaker().saySegments(
      [
        { lang: 'en', text: spokenForm(w) },
        { lang: 'pl', text: prompt(reaction === 'hint' ? 'feedback.hint' : 'feedback.retry') },
        { lang: 'en', text: spokenForm(goal) }
      ],
      speed.value
    );
  }
}
