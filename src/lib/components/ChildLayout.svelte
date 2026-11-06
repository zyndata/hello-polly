<script lang="ts">
  import type { Snippet } from 'svelte';
  import { parentGate } from '../gate/open.svelte';
  import { steadyTaps } from '../steady-taps';

  /**
   * The base of every child screen: a full-bleed sea that fills the viewport in both
   * orientations, with the safe areas kept clear. It never scrolls the page itself (a screen
   * that needs scrolling, like the map, scrolls its own content), and it switches off the
   * gestures that would let a pre-reader leave by accident: pull-to-refresh, text selection
   * and the long-press callout. A finger held on a picture still counts as a tap
   * (`steadyTaps`, STATE.md decision 103).
   *
   * A child screen on show closes the parent gate (STATE.md decision 37).
   */
  let { children, night = false }: { children: Snippet; night?: boolean } = $props();

  parentGate.close();
</script>

<main use:steadyTaps class="sea flex h-dvh flex-col overflow-hidden select-none" class:is-night={night}>
  {@render children()}
</main>
