<!--
  Polly beside an exercise, reacting to the child (PLAN.md "Mascot reacting to the child"): she
  bobs while waiting, hops on a right answer and tilts her head on a wrong one. `beat` changes
  with every reaction, so the same mood twice in a row still plays again.
-->
<script module lang="ts">
  export type Mood = 'idle' | 'happy' | 'think';
</script>

<script lang="ts">
  import ContentImage from './ContentImage.svelte';

  let { mood = 'idle', beat = 0, class: className = '' }: { mood?: Mood; beat?: number; class?: string } = $props();
</script>

{#key beat}
  <span class="polly-buddy is-{mood} {className}" data-testid="polly" data-mood={mood} aria-hidden="true">
    <ContentImage id="parrot" class="pointer-events-none h-full w-full object-contain" />
  </span>
{/key}
