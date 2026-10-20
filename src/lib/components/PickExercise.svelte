<!--
  E1 *Posłuchaj i dotknij* (PLAN.md "Exercises and games"; STATE.md decision 43): Polly asks
  „Gdzie jest {word}?”, and the child taps one of 2–4 pictures. How a tap is answered is
  `PickRound`'s (decision 88); this is the grid of pictures.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ContentImage from './ContentImage.svelte';
  import type { Mood } from './PollyBuddy.svelte';
  import { PickRound } from './pick-round.svelte';
  import { word as wordById } from '../content';
  import type { Segment } from '../speech';
  import type { Word, WordId } from '../types';

  interface Props {
    target: WordId;
    choices: readonly WordId[];
    /** Said before the question, in the same breath (the lesson's opening line). */
    lead?: Segment[];
    /** Called once, after the praise: the wrong taps before the right one. */
    onsolved: (misses: number) => void;
    onmood?: (mood: Mood) => void;
  }

  let { target, choices, lead = [], onsolved, onmood }: Props = $props();

  const round = new PickRound({
    get target() {
      return target;
    },
    onsolved: (misses) => onsolved(misses),
    onmood: (mood) => onmood?.(mood)
  });
  const pictures = $derived(choices.flatMap((id) => (wordById(id) ? [wordById(id) as Word] : [])));

  export function ask(withLead: Segment[] = []): void {
    round.ask(withLead);
  }

  onMount(() => ask(lead));
  onDestroy(() => round.destroy());
</script>

<ul class="choice-grid choices-{pictures.length}" data-testid="pick" data-target={target} data-choices={pictures.length} data-misses={round.misses}>
  {#each pictures as w (w.id)}
    <li>
      {#key round.wiggling(w.id)}
        <button
          type="button"
          class="choice-picture rounded-card bg-foam p-3"
          class:is-wiggling={round.wiggling(w.id) > 0}
          class:is-glowing={round.glowing && w.id === target}
          class:is-right={round.solved && w.id === target}
          aria-label={w.en}
          data-word-id={w.id}
          data-glow={round.misses >= 2 && w.id === target ? '' : undefined}
          onclick={() => round.tap(w.id)}
        >
          <ContentImage id={w.image} class="pointer-events-none h-full w-full object-contain" />
        </button>
      {/key}
    </li>
  {/each}
</ul>
