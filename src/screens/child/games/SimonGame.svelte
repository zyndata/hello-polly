<!--
  E7 *Polly mówi* (Simon says; PLAN.md "Exercises and games"; STATE.md decisions 83, 88): Polly
  says „Polly mówi: pokaż {word}!” and shows the body part beside her; the child does the same
  and taps the big ✅ („Zrobione!”). Ungraded: every ✅ is right, nothing is recorded but the
  stars. A tap on the body part says its word again. Five commands over learned body parts.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ContentImage from '../../../lib/components/ContentImage.svelte';
  import type { Mood } from '../../../lib/components/PollyBuddy.svelte';
  import { nextPraise } from '../../../lib/components/pick-round.svelte';
  import { prompt, word as wordById } from '../../../lib/content';
  import { starsFor } from '../../../lib/domain/exercise';
  import { simonCommands } from '../../../lib/domain/simon';
  import { sounds } from '../../../lib/sound/effects';
  import { promptSegments, speaker, type Segment } from '../../../lib/speech';
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

  const commands = $derived(simonCommands(pool, seed));
  let index = $state(0);
  let busy = $state(false);
  let shown = $state(0);
  let alive = true;
  const part = $derived(wordById(commands[index] ?? ''));

  export function ask(lead: Segment[] = []): void {
    if (!part) return;
    shown += 1;
    void speaker().saySegments([...lead, ...promptSegments(prompt('simon.say'), part)], speed.value);
  }

  onMount(() => ask([{ lang: 'pl', text: prompt('simon.start') }]));
  onDestroy(() => {
    alive = false;
  });

  function hear() {
    unlock();
    if (!part) return;
    sounds().play('tap');
    shown += 1;
    void speaker().sayWord(part, speed.value);
  }

  async function done() {
    unlock();
    if (busy) return;
    busy = true;
    sounds().play('correct');
    onmood('happy');
    await speaker().speak(nextPraise(), { lang: 'en', speed: 'normal' });
    if (!alive) return;
    busy = false;
    if (index < commands.length - 1) {
      index += 1;
      onmood('idle');
      ask();
    } else onfinish(starsFor(commands.length, []));
  }
</script>

<ol class="flex gap-2" aria-label="Postęp" data-testid="dots">
  {#each commands as _, i (i)}
    <li class="lesson-dot" class:is-done={i < index} class:is-now={i === index}></li>
  {/each}
</ol>
{#if part}
  <div class="flex flex-wrap items-center justify-center gap-6" data-testid="simon" data-round={index} data-word={part.id}>
    <ContentImage id="parrot" class="simon-polly pointer-events-none object-contain" />
    {#key shown}
      <button type="button" class="simon-part rounded-card bg-foam p-3" aria-label={part.en} data-word-id={part.id} onclick={hear}>
        <ContentImage id={part.image} class="pointer-events-none h-full w-full object-contain" />
      </button>
    {/key}
  </div>
  <button type="button" class="simon-done rounded-full bg-foam p-3 shadow-lg" aria-label="Zrobione!" data-testid="done" disabled={busy} onclick={done}>
    <ContentImage id="check-mark-button" class="pointer-events-none h-full w-full object-contain" />
  </button>
{/if}
