<!--
  🔊: says the current instruction again (PLAN.md "Exercises and games": a speaker icon repeats
  the prompt).
-->
<script lang="ts">
  import ContentImage from './ContentImage.svelte';
  import { sounds } from '../sound/effects';
  import { unlock } from '../unlock';

  let { onrepeat, class: className = '' }: { onrepeat: () => void; class?: string } = $props();
</script>

<button
  type="button"
  class="size-tap rounded-full bg-foam/85 p-2 shadow-md {className}"
  aria-label="Powtórz"
  data-testid="repeat"
  onclick={() => {
    unlock();
    sounds().play('tap');
    onrepeat();
  }}
>
  <ContentImage id="speaker-high-volume" class="pointer-events-none h-full w-full object-contain" />
</button>
