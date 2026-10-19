<!--
  One game of the shelf (`/child/:id/play/:game`; STATE.md decision 48), over learned words
  only. The game itself is a component below; this screen gives it the frame every child
  screen has (long-press home back to the shelf, 🐢/🐇, Polly, 🔊), and ends it: the stars are
  written (decision 45), the finish screen shows them, and the child is back on the shelf.
-->
<script lang="ts">
  import { replace } from 'svelte-spa-router';
  import ChildLayout from '../../lib/components/ChildLayout.svelte';
  import FinishScreen from '../../lib/components/FinishScreen.svelte';
  import HomeButton from '../../lib/components/HomeButton.svelte';
  import PollyBuddy, { type Mood } from '../../lib/components/PollyBuddy.svelte';
  import RepeatButton from '../../lib/components/RepeatButton.svelte';
  import SpeedToggle from '../../lib/components/SpeedToggle.svelte';
  import { prompt, words } from '../../lib/content';
  import { loadFamily } from '../../lib/db';
  import { childPlan, liveChild } from '../../lib/domain/children';
  import type { ChoiceContext } from '../../lib/domain/exercise';
  import { MIN_LEARNED, gamePool, isGameId, learnedWords, type GameId } from '../../lib/domain/games';
  import { wordStates } from '../../lib/domain/learning';
  import { addStars } from '../../lib/domain/progress';
  import { sounds } from '../../lib/sound/effects';
  import { speaker } from '../../lib/speech';
  import { speed } from '../../lib/speech/speed.svelte';
  import { change } from '../../lib/store';
  import type { Screen } from '../../lib/screens';
  import type { WordId } from '../../lib/types';
  import DigitsGame from './games/DigitsGame.svelte';
  import ListenGame from './games/ListenGame.svelte';
  import MemoryGame from './games/MemoryGame.svelte';

  let { screen, params }: { screen: Screen; params?: Record<string, string> | null } = $props();

  /** The finish screen stays at least this long. */
  const FINISH_MS = 2000;

  const childId = $derived(params?.id ?? '');
  const shelf = $derived(`/child/${childId}/play`);
  let seed = $state(crypto.randomUUID());

  let game = $state<GameId | undefined>();
  let pool = $state<WordId[]>([]);
  let context = $state<ChoiceContext | undefined>();
  let finished = $state(false);
  let stars = $state(0);
  let mood = $state<Mood>('idle');
  let beat = $state(0);
  let player = $state<{ ask: () => void } | undefined>();

  // The router keeps this screen when only `:game` changes, so the game loads from the params.
  $effect(() => {
    void open(childId, params?.game ?? '');
  });

  async function open(child: string, id: string) {
    game = undefined;
    finished = false;
    const file = await loadFamily();
    if (!liveChild(file, child)) return replace('/');
    if (!isGameId(id)) return replace(`/child/${child}/play`);
    const learned = learnedWords(file, child, words);
    pool = gamePool(id, learned, words);
    if (pool.length < MIN_LEARNED) return replace(`/child/${child}/play`);
    context = { plan: childPlan(file, child), states: wordStates(file.progress[child]), words };
    seed = crypto.randomUUID();
    game = id;
  }

  function react(next: Mood) {
    mood = next;
    beat += 1;
  }

  async function finish(earned: number) {
    finished = true;
    stars = earned;
    const saved = change((file, _now, device) => addStars(file, childId, device, earned));
    sounds().play('sparkle');
    const minimum = new Promise((r) => setTimeout(r, FINISH_MS));
    await Promise.all([saved, minimum, speaker().sayPrompt(prompt('feedback.correct'), speed.value)]);
    await replace(shelf);
  }
</script>

<ChildLayout>
  <h1 class="sr-only">{screen.title}</h1>
  {#if finished}
    <div class="flex flex-1 flex-col" data-testid="game-finished">
      <FinishScreen {stars} />
    </div>
  {:else if game && context}
    <header class="flex items-center justify-between gap-3 p-3">
      <HomeButton onexit={() => replace(shelf)} />
      <SpeedToggle />
    </header>

    <div class="flex flex-1 flex-col items-center justify-center gap-4 p-3" data-testid="game" data-game={game}>
      {#if game === 'listen'}
        <ListenGame bind:this={player} {childId} {pool} {context} {seed} onfinish={finish} onmood={react} />
      {:else if game === 'digits'}
        <DigitsGame bind:this={player} {childId} {pool} {seed} onfinish={finish} onmood={react} />
      {:else}
        <MemoryGame bind:this={player} {pool} {seed} onfinish={finish} onmood={react} />
      {/if}
    </div>

    <footer class="flex items-end justify-between p-3">
      <PollyBuddy {mood} {beat} class="size-20" />
      <RepeatButton onrepeat={() => player?.ask()} />
    </footer>
  {/if}
</ChildLayout>
