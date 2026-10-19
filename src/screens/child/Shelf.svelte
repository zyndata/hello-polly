<!--
  The game shelf (PLAN.md "Screens and navigation" `/child/:id/play`; STATE.md decision 48):
  three big tiles, E1 *Posłuchaj i dotknij* (🔊), E2 *Cyferki* (keycap 1) and E3 *Memory*
  (card backs), over learned words only. A game that lacks its four learned words shows Polly
  holding a lock instead, and a tap on it says „Najpierw poznajmy więcej słówek!”. The
  long-press home leads back to the map.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { push, replace } from 'svelte-spa-router';
  import CardBack from '../../lib/components/CardBack.svelte';
  import ChildLayout from '../../lib/components/ChildLayout.svelte';
  import ContentImage from '../../lib/components/ContentImage.svelte';
  import HomeButton from '../../lib/components/HomeButton.svelte';
  import SpeedToggle from '../../lib/components/SpeedToggle.svelte';
  import { prompt, words } from '../../lib/content';
  import { loadFamily } from '../../lib/db';
  import { liveChild } from '../../lib/domain/children';
  import { GAME_IDS, digitImage, gameOpen, learnedWords, type GameId } from '../../lib/domain/games';
  import { sounds } from '../../lib/sound/effects';
  import { speaker } from '../../lib/speech';
  import { speed } from '../../lib/speech/speed.svelte';
  import { unlock } from '../../lib/unlock';
  import type { Screen } from '../../lib/screens';

  let { screen, params }: { screen: Screen; params?: Record<string, string> | null } = $props();

  const LABELS: Record<GameId, string> = { listen: 'Posłuchaj i dotknij', digits: 'Cyferki', memory: 'Memory' };

  const childId = $derived(params?.id ?? '');
  let open = $state<Partial<Record<GameId, boolean>>>({});
  let ready = $state(false);
  let nudges = $state<Partial<Record<GameId, number>>>({});

  onMount(() => {
    void (async () => {
      const file = await loadFamily();
      if (!liveChild(file, childId)) return replace('/');
      const learned = learnedWords(file, childId, words);
      open = Object.fromEntries(GAME_IDS.map((g) => [g, gameOpen(g, learned, words)]));
      ready = true;
      const any = GAME_IDS.some((g) => open[g]);
      if (speaker().isUnlocked) void speaker().sayPrompt(prompt(any ? 'games.choose' : 'games.locked'), speed.value);
    })();
  });

  function choose(game: GameId) {
    unlock();
    if (open[game]) {
      sounds().play('tap');
      void push(`/child/${childId}/play/${game}`);
      return;
    }
    nudges[game] = (nudges[game] ?? 0) + 1;
    sounds().play('wiggle');
    void speaker().sayPrompt(prompt('games.locked'), speed.value);
  }
</script>

<ChildLayout>
  <h1 class="sr-only">{screen.title}</h1>
  {#if ready}
    <header class="flex items-center justify-between gap-3 p-3">
      <HomeButton onexit={() => replace(`/child/${childId}`)} />
      <SpeedToggle />
    </header>

    <ul class="flex flex-1 flex-wrap content-center items-center justify-center gap-5 p-4" data-testid="shelf">
      {#each GAME_IDS as game (game)}
        <li>
          {#key nudges[game] ?? 0}
            <button
              type="button"
              class="game-tile rounded-card bg-foam p-4 shadow-lg"
              class:is-locked={!open[game]}
              class:is-nudged={(nudges[game] ?? 0) > 0}
              aria-label={LABELS[game]}
              data-game={game}
              data-open={open[game] ? 'true' : 'false'}
              onclick={() => choose(game)}
            >
              {#if !open[game]}
                <span class="relative block h-full w-full" data-testid="locked">
                  <ContentImage id="parrot" class="pointer-events-none h-full w-full object-contain opacity-90" />
                  <ContentImage id="locked" class="tile-lock pointer-events-none object-contain" />
                </span>
              {:else if game === 'listen'}
                <ContentImage id="speaker-high-volume" class="pointer-events-none h-full w-full object-contain" />
              {:else if game === 'digits'}
                <ContentImage id={digitImage(1)} class="pointer-events-none h-full w-full object-contain" />
              {:else}
                <span class="grid h-full w-full grid-cols-2 items-center gap-2">
                  <CardBack class="tile-card -rotate-6" />
                  <CardBack class="tile-card rotate-6" />
                </span>
              {/if}
            </button>
          {/key}
        </li>
      {/each}
    </ul>
  {/if}
</ChildLayout>
