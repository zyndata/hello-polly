<!--
  A word as a picture: tapping it says the word (`say ?? en`) at the current 🐢/🐇 speed, and
  the picture bounces while it speaks. The tap is a gesture, so it unlocks speech first. The
  English word is the accessible name only; nothing on it needs reading.
-->
<script lang="ts">
  import ContentImage from './ContentImage.svelte';
  import { sounds } from '../sound/effects';
  import { speaker } from '../speech';
  import { speed } from '../speech/speed.svelte';
  import { unlock } from '../unlock';
  import type { Word } from '../types';

  interface Props {
    word: Word;
    class?: string;
    /** Called on every tap, before the word is spoken. */
    ontap?: () => void;
  }

  let { word, class: className = '', ontap }: Props = $props();

  let speaking = $state(false);
  /** Each tap gets a number, so an older tap finishing does not stop the newer bounce. */
  let taps = 0;

  async function say() {
    unlock();
    sounds().play('tap');
    ontap?.();
    const tap = ++taps;
    speaking = true;
    await speaker().sayWord(word, speed.value);
    if (tap === taps) speaking = false;
  }
</script>

<button
  type="button"
  class="speaking-picture min-h-tap min-w-tap rounded-card bg-foam p-3 shadow-md {className}"
  class:is-speaking={speaking}
  aria-label={word.en}
  data-word-id={word.id}
  onclick={say}
>
  <ContentImage id={word.image} class="pointer-events-none h-full w-full object-contain" />
</button>
