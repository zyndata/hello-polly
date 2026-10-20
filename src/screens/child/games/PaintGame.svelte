<!--
  E8 *Pokoloruj* (PLAN.md "Exercises and games"; STATE.md decision 88): a grey picture of a
  learned thing and three paint pots of learned colours. Polly names the thing, then
  „Pomaluj na {word}!” with the colour. Tap a pot (it says its colour), then the picture: the
  right pot paints it. A wrong pot wiggles and is put down, and from the second miss the right
  one glows. A tap on the picture without a pot asks for one. Each round is an attempt for the
  colour (decision 44).
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Mood } from '../../../lib/components/PollyBuddy.svelte';
  import PaintPicture from '../../../lib/components/PaintPicture.svelte';
  import PaintPot from '../../../lib/components/PaintPot.svelte';
  import { nextPraise } from '../../../lib/components/pick-round.svelte';
  import { prompt, word as wordById } from '../../../lib/content';
  import { starsFor, type ChoiceContext } from '../../../lib/domain/exercise';
  import { paintPools } from '../../../lib/domain/games';
  import { PAINT, choosePot, paintPicture, paintRounds, startPaint } from '../../../lib/domain/paint';
  import { recordAttempt } from '../../../lib/domain/progress';
  import { localDay } from '../../../lib/domain/time';
  import { sounds } from '../../../lib/sound/effects';
  import { promptSegments, speaker, spokenForm, type Segment } from '../../../lib/speech';
  import { speed } from '../../../lib/speech/speed.svelte';
  import { change } from '../../../lib/store';
  import { unlock } from '../../../lib/unlock';
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

  /** The painted picture stays this long before the next round. */
  const AFTER_PAINT_MS = 600;

  const rounds = $derived.by(() => {
    const { colours, things } = paintPools(pool, context.words);
    return paintRounds(colours, things, context.words, seed);
  });
  const firstTries: boolean[] = [];
  let index = $state(0);
  let painting = $state(startPaint());
  let wiggles = $state<Record<WordId, number>>({});
  let alive = true;

  const round = $derived(rounds[index]);
  const thing = $derived(wordById(round?.thing ?? ''));
  const colour = $derived(wordById(round?.colour ?? ''));
  const glowing = $derived(painting.misses >= 2 && !painting.painted ? round?.colour : undefined);

  export function ask(): void {
    if (!thing || !colour) return;
    void speaker().saySegments([{ lang: 'en', text: spokenForm(thing) }, ...promptSegments(prompt('paint.colour'), colour)], speed.value);
  }

  onMount(ask);
  onDestroy(() => {
    alive = false;
  });

  function dip(pot: WordId) {
    unlock();
    const w = wordById(pot);
    if (painting.painted || !w) return;
    sounds().play('tap');
    painting = choosePot(painting, pot);
    void speaker().sayWord(w, speed.value);
  }

  async function paint() {
    unlock();
    if (!round || !thing || !colour || painting.painted) return;
    const pot = painting.pot;
    const { state: next, outcome } = paintPicture(round, painting);
    painting = next;
    if (outcome.kind === 'no-pot') {
      sounds().play('tap');
      void speaker().saySegments([{ lang: 'en', text: spokenForm(thing) }, { lang: 'pl', text: prompt('paint.pot') }], speed.value);
      return;
    }
    const tried = pot ? wordById(pot) : undefined;
    if (outcome.kind !== 'correct') {
      if (pot) wiggles[pot] = (wiggles[pot] ?? 0) + 1;
      sounds().play('wiggle');
      onmood('think');
      const lines: Segment[] = tried ? [{ lang: 'en', text: spokenForm(tried) }] : [];
      lines.push({ lang: 'pl', text: prompt(outcome.kind === 'hint' ? 'feedback.hint' : 'feedback.retry') }, { lang: 'en', text: spokenForm(colour) });
      void speaker().saySegments(lines, speed.value);
      return;
    }
    sounds().play('sparkle');
    onmood('happy');
    firstTries.push(outcome.misses === 0);
    const day = localDay(new Date());
    const target = round.colour;
    const misses = outcome.misses;
    void change((file, _now, device) => recordAttempt(file, childId, device, target, day, misses));
    const minimum = new Promise((r) => setTimeout(r, AFTER_PAINT_MS));
    await speaker().saySegments([{ lang: 'en', text: spokenForm(colour) }, { lang: 'en', text: spokenForm(thing) }], speed.value);
    if (!alive) return;
    await Promise.all([speaker().speak(nextPraise(), { lang: 'en', speed: 'normal' }), minimum]);
    if (!alive) return;
    if (index < rounds.length - 1) {
      index += 1;
      painting = startPaint();
      wiggles = {};
      onmood('idle');
      ask();
    } else onfinish(starsFor(rounds.length, firstTries));
  }
</script>

<ol class="flex gap-2" aria-label="Postęp" data-testid="dots">
  {#each rounds as _, i (i)}
    <li class="lesson-dot" class:is-done={i < index} class:is-now={i === index}></li>
  {/each}
</ol>
{#if round && thing}
  {#key index}
    <div class="flex flex-col items-center gap-4" data-testid="paint" data-round={index} data-thing={round.thing} data-colour={round.colour} data-misses={painting.misses}>
      <button
        type="button"
        class="paint-canvas rounded-card bg-foam p-2 shadow-lg"
        class:is-painted={painting.painted}
        aria-label={thing.en}
        data-testid="paint-picture"
        data-painted={painting.painted ? round.colour : undefined}
        onclick={paint}
      >
        <PaintPicture image={thing.image} paint={painting.painted ? PAINT[round.colour] : undefined} class="pointer-events-none h-full w-full" />
      </button>
      <ul class="flex flex-wrap justify-center gap-4" data-testid="pots">
        {#each round.pots as pot (pot)}
          {@const w = wordById(pot)}
          <li>
            {#key wiggles[pot] ?? 0}
              <button
                type="button"
                class="paint-pot rounded-card bg-foam p-2"
                class:is-selected={painting.pot === pot}
                class:is-wiggling={(wiggles[pot] ?? 0) > 0}
                class:is-glowing={glowing === pot}
                aria-label={w?.en ?? pot}
                aria-pressed={painting.pot === pot}
                data-word-id={pot}
                data-glow={glowing === pot ? '' : undefined}
                onclick={() => dip(pot)}
              >
                <PaintPot paint={PAINT[pot] ?? '#ffffff'} class="pointer-events-none h-full w-full" />
              </button>
            {/key}
          </li>
        {/each}
      </ul>
    </div>
  {/key}
{/if}
