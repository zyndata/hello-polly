<!--
  E4 *Bańki* (PLAN.md "Exercises and games"; STATE.md decision 88): pictures float up in
  bubbles, each lane at its own gentle pace, round and round: nothing is ever timed out. Polly
  asks „Przebij bańkę: {word}!”; the right bubble pops. Five rounds over learned words, each an
  attempt (decision 44). Reduced motion keeps the bubbles still.
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

  // The rounds are fixed when the game opens: four bubbles once there is enough to choose from.
  const steps = $derived(planPicks(pool, context, seed, 5, pool.length >= 6 ? 4 : 3));
  const firstTries: boolean[] = [];
  let index = $state(0);
  const current = $derived(steps[index]);
  const bubbles = $derived(current?.kind === 'pick' ? current.choices.flatMap((id) => (wordById(id) ? [wordById(id) as Word] : [])) : []);

  const round = new PickRound({
    get target() {
      return current?.word ?? '';
    },
    question: 'bubbles.find',
    rightSound: 'pop',
    onsolved: solved,
    onmood: (mood) => onmood(mood)
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
</script>

<ol class="flex gap-2" aria-label="Postęp" data-testid="dots">
  {#each steps as _, i (i)}
    <li class="lesson-dot" class:is-done={i < index} class:is-now={i === index}></li>
  {/each}
</ol>
{#key index}
  <ul class="bubble-field" data-testid="bubbles" data-round={index} data-target={current?.word} data-misses={round.misses}>
    {#each bubbles as w, i (w.id)}
      <li class="bubble-lane lane-{i}">
        {#key round.wiggling(w.id)}
          <button
            type="button"
            class="bubble"
            class:is-wiggling={round.wiggling(w.id) > 0}
            class:is-glowing={round.glowing && w.id === round.target}
            class:is-popped={round.solved && w.id === round.target}
            aria-label={w.en}
            data-word-id={w.id}
            data-glow={round.misses >= 2 && w.id === round.target ? '' : undefined}
            onclick={() => round.tap(w.id)}
          >
            <ContentImage id={w.image} class="pointer-events-none h-3/5 w-3/5 object-contain" />
          </button>
        {/key}
      </li>
    {/each}
  </ul>
{/key}
