<!--
  The start screen (PLAN.md "First run" step 1, "Screens and navigation"): Polly on the sea,
  and the whole screen is one tap target, cued by a pulsing ring. The tap is the unlock
  gesture: nothing speaks or plays before it (STATE.md decisions 24–25). Polly greets in Polish
  and in English, then the app goes on (decision 36): no child yet → /setup; one child → their
  map; two or more → the picker, right here. Once unlocked in this session, the tap is skipped.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { push, replace } from 'svelte-spa-router';
  import ChildLayout from '../lib/components/ChildLayout.svelte';
  import ContentImage from '../lib/components/ContentImage.svelte';
  import { prompt } from '../lib/content';
  import { loadFamily } from '../lib/db';
  import { liveChildren, type ChildEntry } from '../lib/domain/children';
  import { sounds } from '../lib/sound/effects';
  import { speaker } from '../lib/speech';
  import { speed } from '../lib/speech/speed.svelte';
  import { unlock } from '../lib/unlock';
  import type { Screen } from '../lib/screens';

  let { screen }: { screen: Screen; params?: Record<string, string> | null } = $props();

  let stage = $state<'tap' | 'greeting' | 'picker'>('tap');
  let children = $state<ChildEntry[]>([]);

  onMount(() => {
    if (speaker().isUnlocked) {
      stage = 'greeting';
      void route();
    }
  });

  async function start() {
    if (stage !== 'tap') return;
    stage = 'greeting';
    unlock();
    sounds().play('tap');
    await speaker().saySegments(
      [
        { lang: 'pl', text: prompt('start.hello') },
        { lang: 'en', text: 'Hello!' }
      ],
      'normal'
    );
    await route();
  }

  async function route() {
    const list = liveChildren(await loadFamily());
    const only = list[0];
    if (list.length === 0) return replace('/setup');
    if (list.length === 1 && only) return replace(`/child/${only.id}`);
    children = list;
    stage = 'picker';
    void speaker().sayPrompt(prompt('picker.who'), speed.value);
  }

  function pick(child: ChildEntry) {
    unlock();
    sounds().play('tap');
    void push(`/child/${child.id}`);
  }
</script>

<ChildLayout>
  <h1 class="sr-only">{screen.title}</h1>
  {#if stage === 'picker'}
    <div class="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6" data-testid="picker">
      <ContentImage id="parrot" class="pointer-events-none size-28 object-contain drop-shadow-xl" />
      <ul class="flex flex-wrap justify-center gap-5">
        {#each children as child (child.id)}
          <li>
            <button
              type="button"
              class="picker-child grid justify-items-center gap-2 rounded-card bg-foam p-4 shadow-lg"
              aria-label={child.profile.name}
              data-child-id={child.id}
              onclick={() => pick(child)}
            >
              <ContentImage id={child.profile.avatar} class="pointer-events-none size-28 object-contain" />
              <!-- The name is for the parent; the child knows their animal. -->
              <span class="max-w-32 truncate text-xl font-extrabold text-deep-sea" data-for-parent>{child.profile.name}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {:else}
    <button
      type="button"
      class="start-target flex flex-1 flex-col items-center justify-center"
      aria-label="Dotknij, żeby zacząć"
      data-testid="start"
      onclick={start}
    >
      <span class="start-polly" class:is-started={stage !== 'tap'}>
        <span class="start-ring" aria-hidden="true"></span>
        <ContentImage id="parrot" class="pointer-events-none relative size-56 object-contain drop-shadow-xl" />
      </span>
    </button>
  {/if}
</ChildLayout>
