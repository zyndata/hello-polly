<!--
  E3 *Memory*: three pairs face down. Each flip says its word; a pair stays open with a chime
  and „Jest para!”, two different cards turn back after a moment. Nothing is recorded as an
  attempt (STATE.md decision 44); the stars are one per pair.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import CardBack from '../../../lib/components/CardBack.svelte';
  import ContentImage from '../../../lib/components/ContentImage.svelte';
  import type { Mood } from '../../../lib/components/PollyBuddy.svelte';
  import { prompt, word as wordById } from '../../../lib/content';
  import { starsFor } from '../../../lib/domain/exercise';
  import { MEMORY_PAIRS, flip, hideOpen, memoryBoard, memoryDone, startMemory } from '../../../lib/domain/memory';
  import { sounds } from '../../../lib/sound/effects';
  import { speaker, spokenForm } from '../../../lib/speech';
  import { speed } from '../../../lib/speech/speed.svelte';
  import { unlock } from '../../../lib/unlock';
  import type { WordId } from '../../../lib/types';

  interface Props {
    pool: readonly WordId[];
    seed: string;
    onfinish: (stars: number) => void;
    onmood: (mood: Mood) => void;
  }

  let { pool, seed, onfinish, onmood }: Props = $props();

  /** Two different cards stay face up this long. */
  const TURN_BACK_MS = 1200;

  // The cards are laid out when the game opens.
  const board = $derived(memoryBoard(pool, seed));
  let round = $state(startMemory());
  let alive = true;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const faceUp = (i: number) => round.open.includes(i) || round.matched.includes(board[i] as WordId);

  export function ask(): void {
    void speaker().sayPrompt(prompt('memory.start'), speed.value);
  }

  onMount(ask);
  onDestroy(() => {
    alive = false;
    clearTimeout(timer);
  });

  async function turn(i: number) {
    unlock();
    const { state: next, outcome } = flip(board, round, i);
    if (outcome === 'ignored') return;
    round = next;
    const w = wordById(board[i] as WordId);
    if (!w) return;
    sounds().play('tap');
    if (outcome === 'pair') {
      sounds().play('correct');
      onmood('happy');
      const done = memoryDone(board, next);
      await speaker().saySegments(
        [
          { lang: 'en', text: spokenForm(w) },
          { lang: 'pl', text: prompt('memory.pair') }
        ],
        speed.value
      );
      if (alive && done) onfinish(starsFor(MEMORY_PAIRS, []));
      return;
    }
    void speaker().sayWord(w, speed.value);
    if (outcome === 'nopair') {
      onmood('idle');
      timer = setTimeout(() => {
        round = hideOpen(round);
      }, TURN_BACK_MS);
    }
  }
</script>

<ul class="memory-grid" data-testid="memory">
  {#each board as id, i (i)}
    {@const w = wordById(id)}
    <li>
      <button
        type="button"
        class="memory-card rounded-card"
        class:is-open={faceUp(i)}
        class:is-matched={round.matched.includes(id)}
        aria-label={faceUp(i) && w ? w.en : 'Karta'}
        data-card={i}
        data-word={id}
        data-open={faceUp(i) ? 'true' : 'false'}
        onclick={() => turn(i)}
      >
        {#if faceUp(i) && w}
          <span class="block h-full w-full bg-foam p-2">
            <ContentImage id={w.image} class="pointer-events-none h-full w-full object-contain" />
          </span>
        {:else}
          <CardBack class="pointer-events-none h-full w-full" />
        {/if}
      </button>
    </li>
  {/each}
</ul>
