<!--
  E9 *Kosze* (PLAN.md "Exercises and games"; STATE.md decisions 88–89): two baskets, each marked
  with its topic's picture, and six learned pictures, one at a time. Polly says the word and
  „Do którego koszyka?”; the right basket takes the picture, a wrong one wiggles and the
  picture stays; from the second miss the right basket glows. Sorting, not hearing: nothing is
  recorded but the stars (like *Memory*). Only on the shelf when the parent switched it on.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ContentImage from '../../../lib/components/ContentImage.svelte';
  import type { Mood } from '../../../lib/components/PollyBuddy.svelte';
  import { nextPraise } from '../../../lib/components/pick-round.svelte';
  import { prompt, topic as topicById, word as wordById } from '../../../lib/content';
  import { starsFor, type ChoiceContext } from '../../../lib/domain/exercise';
  import { dropIn, sortBoard, sortDone, startSort } from '../../../lib/domain/sort';
  import { sounds } from '../../../lib/sound/effects';
  import { speaker, spokenForm, type Segment } from '../../../lib/speech';
  import { speed } from '../../../lib/speech/speed.svelte';
  import { unlock } from '../../../lib/unlock';
  import type { TopicId, WordId } from '../../../lib/types';

  interface Props {
    pool: readonly WordId[];
    context: ChoiceContext;
    seed: string;
    onfinish: (stars: number) => void;
    onmood: (mood: Mood) => void;
  }

  let { pool, context, seed, onfinish, onmood }: Props = $props();

  /** The picture drops into its basket for this long. */
  const DROP_MS = 550;

  const board = $derived(sortBoard(pool, context.words, seed));
  const firstTries: boolean[] = [];
  let sorting = $state(startSort());
  let wiggles = $state<Record<TopicId, number>>({});
  let dropping = $state<TopicId | undefined>();
  let asked = false;
  let alive = true;

  const item = $derived(board ? wordById(board.items[sorting.index] ?? '') : undefined);
  const glowing = $derived(board && item && sorting.misses >= 2 ? board.home[item.id] : undefined);

  export function ask(): void {
    if (!item) return;
    const lines: Segment[] = [{ lang: 'en', text: spokenForm(item) }];
    if (!asked) lines.push({ lang: 'pl', text: prompt('sort.which') });
    asked = true;
    void speaker().saySegments(lines, speed.value);
  }

  onMount(ask);
  onDestroy(() => {
    alive = false;
  });

  function hear() {
    unlock();
    if (!item) return;
    sounds().play('tap');
    void speaker().sayWord(item, speed.value);
  }

  async function choose(basket: TopicId) {
    unlock();
    if (!board || !item || dropping) return;
    const { state: next, outcome } = dropIn(board, sorting, basket);
    if (outcome.kind !== 'correct') {
      sorting = next;
      wiggles[basket] = (wiggles[basket] ?? 0) + 1;
      sounds().play('wiggle');
      onmood('think');
      void speaker().saySegments(
        [
          { lang: 'en', text: spokenForm(item) },
          { lang: 'pl', text: prompt(outcome.kind === 'hint' ? 'feedback.hint' : 'sort.which') }
        ],
        speed.value
      );
      return;
    }
    firstTries.push(outcome.misses === 0);
    dropping = basket;
    sounds().play('correct');
    onmood('happy');
    await Promise.all([speaker().speak(nextPraise(), { lang: 'en', speed: 'normal' }), new Promise((r) => setTimeout(r, DROP_MS))]);
    if (!alive) return;
    dropping = undefined;
    sorting = next;
    wiggles = {};
    if (sortDone(board, next)) onfinish(starsFor(board.items.length, firstTries));
    else {
      onmood('idle');
      ask();
    }
  }
</script>

{#if board}
  <ol class="flex gap-2" aria-label="Postęp" data-testid="dots">
    {#each board.items as _, i (i)}
      <li class="lesson-dot" class:is-done={i < sorting.index} class:is-now={i === sorting.index}></li>
    {/each}
  </ol>
  {#if item}
    {#key sorting.index}
      <button
        type="button"
        class="sort-item rounded-card bg-foam p-3 shadow-lg"
        class:is-dropping={dropping !== undefined}
        class:to-left={dropping === board.baskets[0]}
        class:to-right={dropping === board.baskets[1]}
        aria-label={item.en}
        data-testid="sort-item"
        data-word-id={item.id}
        data-home={board.home[item.id]}
        onclick={hear}
      >
        <ContentImage id={item.image} class="pointer-events-none h-full w-full object-contain" />
      </button>
    {/key}
  {/if}
  <ul class="flex justify-center gap-6" data-testid="baskets" data-round={sorting.index} data-misses={sorting.misses}>
    {#each board.baskets as basket (basket)}
      {@const t = topicById(basket)}
      <li>
        {#key wiggles[basket] ?? 0}
          <button
            type="button"
            class="sort-basket relative rounded-card bg-foam p-2"
            class:is-wiggling={(wiggles[basket] ?? 0) > 0}
            class:is-glowing={glowing === basket}
            aria-label={t?.pl ?? basket}
            data-basket={basket}
            data-glow={glowing === basket ? '' : undefined}
            onclick={() => choose(basket)}
          >
            <ContentImage id="basket" class="pointer-events-none absolute inset-x-1 bottom-1 h-3/5 object-contain" />
            <ContentImage id={t?.icon ?? 'basket'} class="sort-basket-icon pointer-events-none relative object-contain" />
          </button>
        {/key}
      </li>
    {/each}
  </ul>
{/if}
