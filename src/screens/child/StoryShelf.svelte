<!--
  The story shelf (`/child/:id/stories`; PLAN.md "Stories"; STATE.md decision 87): one big tile
  per story, its first picture on an open book. A story opens at 80 % of its words learned; a
  locked one shows Polly with the lock and says so. A story nobody has heard yet glows. The
  long-press home leads back to the map.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { push, replace } from 'svelte-spa-router';
  import ChildLayout from '../../lib/components/ChildLayout.svelte';
  import ContentImage from '../../lib/components/ContentImage.svelte';
  import HomeButton from '../../lib/components/HomeButton.svelte';
  import SpeedToggle from '../../lib/components/SpeedToggle.svelte';
  import { prompt, stories, topics } from '../../lib/content';
  import { loadFamily } from '../../lib/db';
  import { liveChild } from '../../lib/domain/children';
  import { wordStates } from '../../lib/domain/learning';
  import { storyIsNew, storyOpen } from '../../lib/domain/stories';
  import { sounds } from '../../lib/sound/effects';
  import { speaker } from '../../lib/speech';
  import { speed } from '../../lib/speech/speed.svelte';
  import { unlock } from '../../lib/unlock';
  import type { Screen } from '../../lib/screens';
  import type { ImageId, Story } from '../../lib/types';

  let { screen, params }: { screen: Screen; params?: Record<string, string> | null } = $props();

  const childId = $derived(params?.id ?? '');
  /** In map order, like the album. */
  const shelf = [...stories].sort((a, b) => order(a) - order(b));
  let open = $state<Record<string, boolean>>({});
  let fresh = $state<Record<string, boolean>>({});
  let nudges = $state<Record<string, number>>({});
  let ready = $state(false);

  function order(s: Story): number {
    return topics.find((t) => t.id === s.topic)?.order ?? Number.MAX_SAFE_INTEGER;
  }

  /** The tile's picture: the first picture with a word. */
  function cover(s: Story): ImageId {
    for (const page of s.pages) for (const item of page.scene) if (item.word) return item.image;
    return 'open-book';
  }

  onMount(() => {
    void (async () => {
      const file = await loadFamily();
      if (!liveChild(file, childId)) return replace('/');
      const states = wordStates(file.progress[childId]);
      open = Object.fromEntries(shelf.map((s) => [s.id, storyOpen(s, states)]));
      fresh = Object.fromEntries(shelf.map((s) => [s.id, storyIsNew(s, states, file.progress[childId])]));
      ready = true;
      const any = shelf.some((s) => open[s.id]);
      if (speaker().isUnlocked) void speaker().sayPrompt(prompt(any ? 'stories.choose' : 'stories.locked'), speed.value);
    })();
  });

  function choose(s: Story) {
    unlock();
    if (open[s.id]) {
      sounds().play('tap');
      void push(`/child/${childId}/stories/${s.id}`);
      return;
    }
    nudges[s.id] = (nudges[s.id] ?? 0) + 1;
    sounds().play('wiggle');
    void speaker().sayPrompt(prompt('stories.locked'), speed.value);
  }
</script>

<ChildLayout>
  <h1 class="sr-only">{screen.title}</h1>
  {#if ready}
    <header class="flex items-center justify-between gap-3 p-3">
      <HomeButton onexit={() => replace(`/child/${childId}`)} />
      <SpeedToggle />
    </header>

    <ul class="flex flex-1 flex-wrap content-center items-center justify-center gap-5 overflow-y-auto p-4" data-testid="story-shelf">
      {#each shelf as s (s.id)}
        <li>
          {#key nudges[s.id] ?? 0}
            <button
              type="button"
              class="game-tile story-tile relative rounded-card bg-foam p-3"
              class:is-locked={!open[s.id]}
              class:is-nudged={(nudges[s.id] ?? 0) > 0}
              class:is-new-story={fresh[s.id]}
              aria-label={s.titlePl}
              data-story={s.id}
              data-open={open[s.id] ? 'true' : 'false'}
              data-new={fresh[s.id] ? 'true' : 'false'}
              onclick={() => choose(s)}
            >
              {#if open[s.id]}
                <ContentImage id="open-book" class="pointer-events-none absolute inset-x-2 bottom-1 h-1/2 object-contain opacity-90" />
                <ContentImage id={cover(s)} class="pointer-events-none relative h-3/4 w-full object-contain" />
              {:else}
                <span class="relative block h-full w-full" data-testid="locked">
                  <ContentImage id="parrot" class="pointer-events-none h-full w-full object-contain opacity-90" />
                  <ContentImage id="locked" class="tile-lock pointer-events-none object-contain" />
                </span>
              {/if}
            </button>
          {/key}
        </li>
      {/each}
    </ul>
  {/if}
</ChildLayout>
