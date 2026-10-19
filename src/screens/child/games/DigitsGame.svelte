<!--
  E2 *Cyferki* (PLAN.md, the brief's example): four pictures and four digit tiles. Tapping a
  digit says the word it stands for; tapping that picture takes both off the board, as if into
  Polly's treasure bag. A wrong picture wiggles and stays; from the second miss on the right
  one glows (decision 43). Each match is an attempt (decision 44).
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ContentImage from '../../../lib/components/ContentImage.svelte';
  import type { Mood } from '../../../lib/components/PollyBuddy.svelte';
  import { praise, prompt, word as wordById } from '../../../lib/content';
  import { DIGITS, digitsBoard, digitsDone, selectDigit, startDigits, tapPicture, type Digit } from '../../../lib/domain/digits';
  import { starsFor } from '../../../lib/domain/exercise';
  import { digitImage } from '../../../lib/domain/games';
  import { recordAttempt } from '../../../lib/domain/progress';
  import { localDay } from '../../../lib/domain/time';
  import { sounds } from '../../../lib/sound/effects';
  import { speaker, spokenForm, type Segment } from '../../../lib/speech';
  import { speed } from '../../../lib/speech/speed.svelte';
  import { change } from '../../../lib/store';
  import { unlock } from '../../../lib/unlock';
  import type { Word, WordId } from '../../../lib/types';

  interface Props {
    childId: string;
    pool: readonly WordId[];
    seed: string;
    onfinish: (stars: number) => void;
    onmood: (mood: Mood) => void;
  }

  let { childId, pool, seed, onfinish, onmood }: Props = $props();

  // The board is fixed when the game opens.
  const board = $derived(digitsBoard(pool, seed));
  const pictures = $derived((board?.pictures ?? []).flatMap((id) => (wordById(id) ? [wordById(id) as Word] : [])));
  const firstTries: boolean[] = [];
  let round = $state(startDigits());
  let wiggles = $state<Record<WordId, number>>({});
  let toldToFind = false;
  let praised = 0;
  let alive = true;

  const selectedWord = $derived(board && round.selected !== null ? wordById(board.pairs[round.selected]) : undefined);
  const glowing = $derived(round.selected !== null && (round.misses[round.selected] ?? 0) >= 2 ? selectedWord?.id : undefined);
  const gone = $derived(new Set(board ? round.matched.map((d) => board.pairs[d]) : []));

  export function ask(): void {
    if (selectedWord) void speaker().sayWord(selectedWord, speed.value);
    else void speaker().sayPrompt(prompt('digits.start'), speed.value);
  }

  onMount(ask);
  onDestroy(() => {
    alive = false;
  });

  function pickDigit(digit: Digit) {
    unlock();
    if (!board || round.matched.includes(digit)) return;
    sounds().play('tap');
    round = selectDigit(round, digit);
    const w = wordById(board.pairs[digit]);
    if (!w) return;
    const segments: Segment[] = [{ lang: 'en', text: spokenForm(w) }];
    if (!toldToFind) segments.push({ lang: 'pl', text: prompt('digits.find') });
    toldToFind = true;
    void speaker().saySegments(segments, speed.value);
  }

  async function tap(w: Word) {
    unlock();
    if (!board) return;
    const { state: next, outcome } = tapPicture(board, round, w.id);
    round = next;
    if (outcome.kind === 'none') {
      if (!gone.has(w.id)) {
        sounds().play('tap');
        void speaker().sayWord(w, speed.value);
      }
      return;
    }
    const target = wordById(board.pairs[outcome.digit]);
    if (outcome.kind === 'correct') {
      sounds().play('correct');
      onmood('happy');
      firstTries.push(outcome.misses === 0);
      const day = localDay(new Date());
      const misses = outcome.misses;
      void change((file, _now, device) => recordAttempt(file, childId, device, w.id, day, misses));
      const done = digitsDone(next);
      await speaker().sayWord(w, speed.value);
      if (!alive) return;
      const line = praise[praised++ % praise.length] ?? 'Great!';
      await speaker().speak(line, { lang: 'en', speed: 'normal' });
      if (alive && done) onfinish(starsFor(DIGITS.length, firstTries));
      return;
    }
    wiggles[w.id] = (wiggles[w.id] ?? 0) + 1;
    sounds().play('wiggle');
    onmood('think');
    if (!target) return;
    void speaker().saySegments(
      [
        { lang: 'en', text: spokenForm(w) },
        { lang: 'pl', text: prompt(outcome.kind === 'hint' ? 'feedback.hint' : 'feedback.retry') },
        { lang: 'en', text: spokenForm(target) }
      ],
      speed.value
    );
  }
</script>

{#if board}
  <ul class="choice-grid choices-4" data-testid="digit-pictures">
    {#each pictures as w (w.id)}
      <li>
        {#key wiggles[w.id] ?? 0}
          <button
            type="button"
            class="choice-picture digits-picture rounded-card bg-foam p-3"
            class:is-wiggling={(wiggles[w.id] ?? 0) > 0}
            class:is-glowing={glowing === w.id}
            class:is-gone={gone.has(w.id)}
            aria-label={w.en}
            data-word-id={w.id}
            data-matched={gone.has(w.id) ? '' : undefined}
            data-glow={glowing === w.id ? '' : undefined}
            disabled={gone.has(w.id)}
            onclick={() => tap(w)}
          >
            <ContentImage id={w.image} class="pointer-events-none h-full w-full object-contain" />
          </button>
        {/key}
      </li>
    {/each}
  </ul>

  <ul class="flex flex-wrap justify-center gap-3" data-testid="digits">
    {#each DIGITS as digit (digit)}
      <li>
        <button
          type="button"
          class="digit-tile size-tap rounded-2xl bg-foam p-1"
          class:is-selected={round.selected === digit}
          class:is-gone={round.matched.includes(digit)}
          aria-label="Cyferka {digit}"
          aria-pressed={round.selected === digit}
          data-digit={digit}
          data-matched={round.matched.includes(digit) ? '' : undefined}
          disabled={round.matched.includes(digit)}
          onclick={() => pickDigit(digit)}
        >
          <ContentImage id={digitImage(digit)} class="pointer-events-none h-full w-full object-contain" />
        </button>
      </li>
    {/each}
  </ul>
{/if}
