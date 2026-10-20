<!--
  The game shelf (PLAN.md "Screens and navigation" `/child/:id/play`; STATE.md decisions 48,
  88–89): a big tile per game, over learned words only. E1 *Posłuchaj i dotknij* (🔊), E2
  *Cyferki* (keycap 1), E3 *Memory* (card backs), E4 *Bańki* (🫧), E5 *Nakarm Polly* (🍽),
  E6 *Gdzie jest…?* (🔍), E7 *Polly mówi* (✋), E8 *Pokoloruj* (🎨), and E9 *Kosze* (🧺) when
  the parent switched it on. A game that lacks its learned words shows Polly holding a lock
  instead, and a tap on it says „Najpierw poznajmy więcej słówek!”. The long-press home leads
  back to the map.
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
  import { childPlan, liveChild } from '../../lib/domain/children';
  import { digitImage, gameOpen, learnedWords, shelfGames, type GameId } from '../../lib/domain/games';
  import { sounds } from '../../lib/sound/effects';
  import { speaker } from '../../lib/speech';
  import { speed } from '../../lib/speech/speed.svelte';
  import { unlock } from '../../lib/unlock';
  import type { Screen } from '../../lib/screens';

  let { screen, params }: { screen: Screen; params?: Record<string, string> | null } = $props();

  const LABELS: Record<GameId, string> = {
    listen: 'Posłuchaj i dotknij',
    digits: 'Cyferki',
    memory: 'Memory',
    bubbles: 'Bańki',
    feed: 'Nakarm Polly',
    spy: 'Gdzie jest…?',
    simon: 'Polly mówi',
    paint: 'Pokoloruj',
    sort: 'Kosze'
  };
  /** The tile's picture, for the games drawn with one. */
  const TILES: Partial<Record<GameId, string>> = {
    listen: 'speaker-high-volume',
    digits: digitImage(1),
    bubbles: 'bubbles',
    feed: 'fork-and-knife-with-plate',
    spy: 'magnifying-glass-tilted-left',
    simon: 'raised-hand',
    paint: 'artist-palette',
    sort: 'basket'
  };

  const childId = $derived(params?.id ?? '');
  let games = $state<GameId[]>([]);
  let open = $state<Partial<Record<GameId, boolean>>>({});
  let ready = $state(false);
  let nudges = $state<Partial<Record<GameId, number>>>({});

  onMount(() => {
    void (async () => {
      const file = await loadFamily();
      if (!liveChild(file, childId)) return replace('/');
      const learned = learnedWords(file, childId, words);
      games = shelfGames(childPlan(file, childId));
      open = Object.fromEntries(games.map((g) => [g, gameOpen(g, learned, words)]));
      ready = true;
      const any = games.some((g) => open[g]);
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

    <ul class="game-shelf flex flex-1 flex-wrap content-center items-center justify-center gap-4 overflow-y-auto p-4" data-testid="shelf">
      {#each games as game (game)}
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
              {:else if TILES[game]}
                <ContentImage id={TILES[game] as string} class="pointer-events-none h-full w-full object-contain" />
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
