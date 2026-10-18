<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * The base of every child screen: a full-bleed sea that fills the viewport in both
   * orientations, with the safe areas kept clear. It never scrolls the page itself (a screen
   * that needs scrolling, like the map, scrolls its own content), and it switches off the
   * gestures that would let a pre-reader leave by accident: pull-to-refresh, text selection
   * and the long-press callout.
   */
  let { children }: { children: Snippet } = $props();
</script>

<main class="sea flex h-dvh flex-col overflow-hidden select-none">
  {@render children()}
</main>
