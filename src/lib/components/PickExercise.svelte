<!--
  E1 *Posłuchaj i dotknij* (PLAN.md "Exercises and games"; STATE.md decision 43): Polly asks
  „Gdzie jest {word}?”, and the child taps one of 2–4 pictures. Every tap says the tapped
  picture's word. A right tap chimes, sparkles and praises in English, then `onsolved` follows
  by itself. A wrong tap wiggles, and Polly asks again; from the second miss on, the right
  picture glows. Nothing is ever taken away or marked wrong.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ContentImage from './ContentImage.svelte';
  import type { Mood } from './PollyBuddy.svelte';
  import { praise, prompt, word as wordById } from '../content';
  import { react } from '../domain/exercise';
  import { sounds } from '../sound/effects';
  import { promptSegments, speaker, spokenForm, type Segment } from '../speech';
  import { speed } from '../speech/speed.svelte';
  import { unlock } from '../unlock';
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

  /** The praise has this long at least before the next step. */
  const AFTER_CORRECT_MS = 500;

  let misses = $state(0);
  let solved = $state(false);
  let wiggles = $state<Record<WordId, number>>({});
  let alive = true;

  const goal = $derived(wordById(target));
  const pictures = $derived(choices.flatMap((id) => (wordById(id) ? [wordById(id) as Word] : [])));
  const glow = $derived(misses >= 2);

  /** Rotates through the praise list, so a run of right answers is not one word over and over. */
  let praised = 0;

  export function ask(withLead: Segment[] = []): void {
    if (!goal) return;
    void speaker().saySegments([...withLead, ...promptSegments(prompt('pick.find'), goal)], speed.value);
  }

  onMount(() => ask(lead));
  onDestroy(() => {
    alive = false;
  });

  async function tap(w: Word) {
    unlock();
    if (solved || !goal) return;
    const reaction = react(misses, w.id === target);
    if (reaction === 'correct') {
      solved = true;
      sounds().play('correct');
      onmood?.('happy');
      const minimum = new Promise((r) => setTimeout(r, AFTER_CORRECT_MS));
      await speaker().sayWord(w, speed.value);
      if (!alive) return;
      const line = praise[praised++ % praise.length] ?? 'Great!';
      await Promise.all([speaker().speak(line, { lang: 'en', speed: 'normal' }), minimum]);
      if (alive) onsolved(misses);
      return;
    }
    misses += 1;
    wiggles[w.id] = (wiggles[w.id] ?? 0) + 1;
    sounds().play('wiggle');
    onmood?.('think');
    void speaker().saySegments(
      [
        { lang: 'en', text: spokenForm(w) },
        { lang: 'pl', text: prompt(reaction === 'hint' ? 'feedback.hint' : 'feedback.retry') },
        { lang: 'en', text: spokenForm(goal) }
      ],
      speed.value
    );
  }
</script>

<ul class="choice-grid choices-{pictures.length}" data-testid="pick" data-target={target} data-choices={pictures.length} data-misses={misses}>
  {#each pictures as w (w.id)}
    <li>
      {#key wiggles[w.id] ?? 0}
        <button
          type="button"
          class="choice-picture rounded-card bg-foam p-3"
          class:is-wiggling={(wiggles[w.id] ?? 0) > 0}
          class:is-glowing={glow && w.id === target && !solved}
          class:is-right={solved && w.id === target}
          aria-label={w.en}
          data-word-id={w.id}
          data-glow={glow && w.id === target ? '' : undefined}
          onclick={() => tap(w)}
        >
          <ContentImage id={w.image} class="pointer-events-none h-full w-full object-contain" />
        </button>
      {/key}
    </li>
  {/each}
</ul>
