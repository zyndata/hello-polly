<!--
  E1 in free play: five picks over learned words, pictures by box (STATE.md decision 48). Each
  solved pick is an attempt like any other (decision 44).
-->
<script lang="ts">
  import PickExercise from '../../../lib/components/PickExercise.svelte';
  import type { Mood } from '../../../lib/components/PollyBuddy.svelte';
  import { planListenGame, starsFor, type ChoiceContext } from '../../../lib/domain/exercise';
  import { recordAttempt } from '../../../lib/domain/progress';
  import { localDay } from '../../../lib/domain/time';
  import { change } from '../../../lib/store';
  import type { WordId } from '../../../lib/types';

  interface Props {
    childId: string;
    pool: readonly WordId[];
    context: ChoiceContext;
    seed: string;
    onfinish: (stars: number) => void;
    onmood: (mood: Mood) => void;
  }

  let { childId, pool, context, seed, onfinish, onmood }: Props = $props();

  // The round is fixed when the game opens.
  const steps = $derived(planListenGame(pool, context, seed));
  const firstTries: boolean[] = [];
  let index = $state(0);
  let exercise = $state<{ ask: () => void } | undefined>();
  const current = $derived(steps[index]);

  export function ask(): void {
    exercise?.ask();
  }

  function solved(misses: number) {
    const step = current;
    if (!step) return;
    firstTries.push(misses === 0);
    const day = localDay(new Date());
    void change((file, _now, device) => recordAttempt(file, childId, device, step.word, day, misses));
    if (index < steps.length - 1) {
      index += 1;
      onmood('idle');
    } else onfinish(starsFor(steps.length, firstTries));
  }
</script>

<ol class="flex gap-2" aria-label="Postęp" data-testid="dots">
  {#each steps as _, i (i)}
    <li class="lesson-dot" class:is-done={i < index} class:is-now={i === index}></li>
  {/each}
</ol>
{#if current && current.kind === 'pick'}
  {#key index}
    <PickExercise bind:this={exercise} target={current.word} choices={current.choices} onsolved={solved} {onmood} />
  {/key}
{/if}
