<!--
  E6 *Gdzie jest…?* (I spy; PLAN.md "Exercises and games"; STATE.md decision 88): one scene with
  5–8 learned things. Polly asks „Gdzie jest {word}?” five times, a different thing each time;
  the child finds it in the scene. A found thing keeps a gold ring. Each question is an attempt
  (decision 44).
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { PickRound } from '../../../lib/components/pick-round.svelte';
  import type { Mood } from '../../../lib/components/PollyBuddy.svelte';
  import Scene from '../../../lib/components/Scene.svelte';
  import { starsFor, type ChoiceContext } from '../../../lib/domain/exercise';
  import { recordAttempt } from '../../../lib/domain/progress';
  import { spyBoard } from '../../../lib/domain/spy';
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

  // The scene is laid out once, when the game opens.
  const board = $derived(spyBoard(pool, context.words, seed));
  const firstTries: boolean[] = [];
  let index = $state(0);
  let found = $state<WordId[]>([]);
  const target = $derived(board.targets[index] ?? '');
  const at = (id: WordId) => board.items.findIndex((item) => item.word === id);

  const round = new PickRound({
    get target() {
      return target;
    },
    onsolved: solved,
    onmood: (mood) => onmood(mood)
  });

  const wiggles = $derived(Object.fromEntries(Object.entries(round.wiggles).map(([id, n]) => [at(id), n])));
  const foundAt = $derived(new Set([...found, ...(round.solved ? [target] : [])].map(at)));

  export function ask(): void {
    round.ask();
  }

  onMount(ask);
  onDestroy(() => round.destroy());

  function solved(misses: number) {
    const word = target;
    firstTries.push(misses === 0);
    found = [...found, word];
    const day = localDay(new Date());
    void change((file, _now, device) => recordAttempt(file, childId, device, word, day, misses));
    if (index < board.targets.length - 1) {
      index += 1;
      round.reset();
      onmood('idle');
      round.ask();
    } else onfinish(starsFor(board.targets.length, firstTries));
  }
</script>

<ol class="flex gap-2" aria-label="Postęp" data-testid="dots">
  {#each board.targets as _, i (i)}
    <li class="lesson-dot" class:is-done={i < index} class:is-now={i === index}></li>
  {/each}
</ol>
<div class="flex w-full justify-center" data-testid="spy" data-round={index} data-target={target} data-misses={round.misses}>
  <Scene
    items={board.items}
    ontap={(i) => {
      const id = board.items[i]?.word;
      if (id) void round.tap(id);
    }}
    {wiggles}
    glowing={round.glowing ? at(target) : -1}
    found={foundAt}
  />
</div>
