<!--
  E5 *Nakarm Polly* (PLAN.md "Exercises and games"; STATE.md decision 88): three or four
  pictures and a big, hungry Polly. „Daj Polly: {word}!” The child drags the picture onto Polly,
  or simply taps it; the right one is eaten (or played with), a wrong one wiggles and goes back.
  Five rounds over learned words, each an attempt (decision 44). The drag moves the picture
  with a CSSOM `translate` write, never a markup style.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ContentImage from '../../../lib/components/ContentImage.svelte';
  import { PickRound } from '../../../lib/components/pick-round.svelte';
  import type { Mood } from '../../../lib/components/PollyBuddy.svelte';
  import { word as wordById } from '../../../lib/content';
  import { planPicks, starsFor, type ChoiceContext } from '../../../lib/domain/exercise';
  import { recordAttempt } from '../../../lib/domain/progress';
  import { localDay } from '../../../lib/domain/time';
  import { change } from '../../../lib/store';
  import { unlock } from '../../../lib/unlock';
  import type { Word, WordId } from '../../../lib/types';

  interface Props {
    childId: string;
    pool: readonly WordId[];
    context: ChoiceContext;
    seed: string;
    onfinish: (stars: number) => void;
    onmood: (mood: Mood) => void;
  }

  let { childId, pool, context, seed, onfinish, onmood }: Props = $props();

  /** A press that moves less than this is a tap. */
  const TAP_SLOP_PX = 12;

  const steps = $derived(planPicks(pool, context, seed, 5, pool.length >= 6 ? 4 : 3));
  const firstTries: boolean[] = [];
  let index = $state(0);
  const current = $derived(steps[index]);
  const food = $derived(current?.kind === 'pick' ? current.choices.flatMap((id) => (wordById(id) ? [wordById(id) as Word] : [])) : []);
  let mouth = $state<HTMLElement | undefined>();
  let chomp = $state(0);

  const round = new PickRound({
    get target() {
      return current?.word ?? '';
    },
    question: 'feed.find',
    onsolved: solved,
    onmood: (mood) => {
      if (mood === 'happy') chomp += 1;
      onmood(mood);
    }
  });

  export function ask(): void {
    round.ask();
  }

  onMount(ask);
  onDestroy(() => round.destroy());

  function solved(misses: number) {
    const step = current;
    if (!step) return;
    firstTries.push(misses === 0);
    const day = localDay(new Date());
    void change((file, _now, device) => recordAttempt(file, childId, device, step.word, day, misses));
    if (index < steps.length - 1) {
      index += 1;
      round.reset();
      onmood('idle');
      round.ask();
    } else onfinish(starsFor(steps.length, firstTries));
  }

  /**
   * Dragging a picture: it follows the finger; let go over Polly (or barely moved: a tap) and it
   * is given to her, anywhere else it goes back.
   */
  function draggable(node: HTMLElement, id: WordId) {
    let start: { x: number; y: number; pointer: number } | undefined;
    const back = () => {
      node.style.translate = '';
      node.classList.remove('is-dragging');
    };
    const down = (e: PointerEvent) => {
      if (round.solved) return;
      unlock();
      start = { x: e.clientX, y: e.clientY, pointer: e.pointerId };
      node.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.pointer) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < TAP_SLOP_PX && !node.classList.contains('is-dragging')) return;
      node.classList.add('is-dragging');
      node.style.translate = `${dx}px ${dy}px`;
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.pointer) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      start = undefined;
      const r = mouth?.getBoundingClientRect();
      const overPolly = r !== undefined && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      back();
      if (moved < TAP_SLOP_PX || overPolly) void round.tap(id);
    };
    const cancel = () => {
      start = undefined;
      back();
    };
    // A keyboard's Enter or Space is a tap.
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      void round.tap(id);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', cancel);
    node.addEventListener('keydown', key);
    return {
      destroy() {
        node.removeEventListener('pointerdown', down);
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', cancel);
        node.removeEventListener('keydown', key);
      }
    };
  }
</script>

<ol class="flex gap-2" aria-label="Postęp" data-testid="dots">
  {#each steps as _, i (i)}
    <li class="lesson-dot" class:is-done={i < index} class:is-now={i === index}></li>
  {/each}
</ol>
{#key index}
  <ul class="flex flex-wrap justify-center gap-4" data-testid="feed" data-round={index} data-target={current?.word} data-misses={round.misses}>
    {#each food as w (w.id)}
      <li>
        {#key round.wiggling(w.id)}
          <button
            type="button"
            class="feed-item rounded-card bg-foam p-2"
            class:is-wiggling={round.wiggling(w.id) > 0}
            class:is-glowing={round.glowing && w.id === round.target}
            class:is-eaten={round.solved && w.id === round.target}
            aria-label={w.en}
            data-word-id={w.id}
            data-glow={round.misses >= 2 && w.id === round.target ? '' : undefined}
            use:draggable={w.id}
          >
            <ContentImage id={w.image} class="pointer-events-none h-full w-full object-contain" />
          </button>
        {/key}
      </li>
    {/each}
  </ul>
{/key}
<div class="feed-polly" bind:this={mouth} data-testid="polly-mouth">
  {#key chomp}
    <ContentImage id="parrot" class="feed-polly-picture pointer-events-none h-full w-full object-contain {chomp > 0 ? 'is-chomping' : ''}" />
  {/key}
  <ContentImage id="fork-and-knife-with-plate" class="feed-plate pointer-events-none object-contain" />
</div>
