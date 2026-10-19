<!--
  The treasure map, the child's home (PLAN.md "Screens and navigation"): a vertical sea of
  islands, one per lesson. Islands with a flag are lessons done (on any device), Polly's ship
  waits at the next one, and a few more lie ahead. Tapping the ship's island opens the lesson;
  when the next lesson would be empty (nothing new, due or to practise), Polly says so instead
  (STATE.md decisions 39, 46). The 🎲 at the bottom opens the game shelf. The gear opens the
  parent gate; the long-press home leads back to the picker when there are two or more
  children (decision 36). Nothing here needs reading.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { push, replace } from 'svelte-spa-router';
  import ChildLayout from '../../lib/components/ChildLayout.svelte';
  import ContentImage from '../../lib/components/ContentImage.svelte';
  import HomeButton from '../../lib/components/HomeButton.svelte';
  import Island from '../../lib/components/Island.svelte';
  import { prompt, topics } from '../../lib/content';
  import { loadFamily } from '../../lib/db';
  import { liveChild, liveChildren } from '../../lib/domain/children';
  import { lessonFor } from '../../lib/domain/lesson';
  import { lessonsDone } from '../../lib/domain/progress';
  import { localDay } from '../../lib/domain/time';
  import { sounds } from '../../lib/sound/effects';
  import { speaker } from '../../lib/speech';
  import { speed } from '../../lib/speech/speed.svelte';
  import { unlock } from '../../lib/unlock';
  import type { Screen } from '../../lib/screens';
  import type { ChildProfile } from '../../lib/types';

  let { screen, params }: { screen: Screen; params?: Record<string, string> | null } = $props();

  /** Islands drawn ahead of the ship. */
  const AHEAD = 2;

  const childId = $derived(params?.id ?? '');
  let profile = $state<ChildProfile | undefined>();
  let done = $state(0);
  /** Steps in the next lesson; 0 means there is nothing to sail to yet. */
  let lessonSteps = $state(0);
  let siblings = $state(0);
  let nudge = $state(0);
  let current = $state<HTMLElement | undefined>();

  /** Bottom to top would be the sea chart; top to bottom reads like a path to scroll down. */
  const islands = $derived(
    Array.from({ length: done + 1 + AHEAD }, (_, i) => ({
      index: i,
      kind: i < done ? 'done' : i === done ? 'current' : 'ahead'
    }))
  );

  onMount(() => {
    void (async () => {
      const file = await loadFamily();
      const child = liveChild(file, childId);
      if (!child) return replace('/');
      profile = child;
      siblings = liveChildren(file).length;
      done = lessonsDone(file.progress[childId]);
      lessonSteps = lessonFor(file, childId, topics, localDay(new Date())).length;
      await tick();
      current?.scrollIntoView({ block: 'center' });
      if (speaker().isUnlocked) void speaker().sayPrompt(prompt(lessonSteps > 0 ? 'map.go' : 'map.later'), speed.value);
    })();
  });

  function sail() {
    unlock();
    if (lessonSteps > 0) {
      sounds().play('tap');
      void push(`/child/${childId}/lesson`);
      return;
    }
    nudge += 1;
    sounds().play('wiggle');
    void speaker().sayPrompt(prompt('map.later'), speed.value);
  }

  function games() {
    unlock();
    sounds().play('tap');
    void push(`/child/${childId}/play`);
  }

  function gear() {
    unlock();
    sounds().play('tap');
    void speaker().sayPrompt(prompt('gate.parents'), speed.value);
    void push('/parent');
  }
</script>

<ChildLayout>
  <h1 class="sr-only">{screen.title}</h1>
  {#if profile}
    <header class="flex items-center justify-between gap-3 p-3">
      {#if siblings >= 2}
        <HomeButton onexit={() => push('/')} />
      {:else}
        <span class="grid size-tap place-items-center rounded-full bg-foam/85 p-2 shadow-md" aria-hidden="true">
          <ContentImage id={profile.avatar} class="h-full w-full object-contain" />
        </span>
      {/if}
      <button type="button" class="size-tap rounded-full bg-foam/85 p-2 shadow-md" aria-label="Dla rodzica" data-testid="gear" onclick={gear}>
        <ContentImage id="gear" class="pointer-events-none h-full w-full object-contain" />
      </button>
    </header>

    <ol class="map-path flex-1 overflow-y-auto px-4 pb-10" data-testid="map" data-done={done}>
      {#each islands as island (island.index)}
        <li class="map-stop map-stop-{island.index % 4}" data-island={island.kind}>
          {#if island.kind === 'current'}
            <button
              type="button"
              class="island-current relative"
              aria-label="Płyniemy na wyspę"
              data-testid="sail"
              bind:this={current}
              onclick={sail}
            >
              {#key nudge}
                <span class="island-wrap" class:is-nudged={nudge > 0}>
                  <Island class="pointer-events-none h-full w-full" />
                </span>
              {/key}
              <span class="ship" class:is-waiting={lessonSteps > 0} aria-hidden="true">
                <ContentImage id="sailboat" class="pointer-events-none h-full w-full object-contain" />
                <ContentImage id="parrot" class="ship-polly pointer-events-none object-contain" />
              </span>
            </button>
          {:else}
            <span class="island-still" class:is-ahead={island.kind === 'ahead'} aria-hidden="true">
              <Island flag={island.kind === 'done'} class="h-full w-full" />
            </span>
          {/if}
        </li>
      {/each}
    </ol>

    <nav class="bottom-bar flex justify-center gap-4 p-3" aria-label="Menu">
      <button type="button" class="bar-button size-tap rounded-full bg-foam/90 p-2 shadow-md" aria-label="Gry" data-testid="games" onclick={games}>
        <ContentImage id="game-die" class="pointer-events-none h-full w-full object-contain" />
      </button>
    </nav>
  {/if}
</ChildLayout>
