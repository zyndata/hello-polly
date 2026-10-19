<!--
  The end of a lesson or a game: an island with its flag (a lesson) or Polly alone (a game),
  and the stars earned, appearing one by one. Nothing to read: the stars are drawn.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import ContentImage from './ContentImage.svelte';
  import Island from './Island.svelte';

  /** Between two stars appearing. */
  const STAR_MS = 90;

  let { stars, flag = false }: { stars: number; flag?: boolean } = $props();

  let shown = $state(0);

  onMount(() => {
    const timer = setInterval(() => {
      if (shown >= stars) return clearInterval(timer);
      shown += 1;
    }, STAR_MS);
    return () => clearInterval(timer);
  });
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-4 p-6">
  {#if flag}
    <span class="finish-island">
      <Island flag class="h-full w-full" />
    </span>
  {/if}
  <ContentImage id="parrot" class="finish-polly pointer-events-none size-32 object-contain drop-shadow-xl" />
  <ol class="flex max-w-md flex-wrap justify-center gap-1" data-testid="stars" data-stars={stars} aria-label="Gwiazdki: {stars}">
    {#each { length: shown }, i (i)}
      <li class="earned-star">
        <svg viewBox="0 0 24 24" class="h-full w-full" aria-hidden="true" focusable="false">
          <path
            d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
            class="fill-gold stroke-amber-600"
            stroke-width="1"
            stroke-linejoin="round"
          />
        </svg>
      </li>
    {/each}
  </ol>
</div>
