<!--
  The start screen (PLAN.md "First run" step 1): Polly on the sea, and the whole screen is one
  tap target, cued by a pulsing ring. The tap is the unlock gesture: nothing speaks or plays
  before it (STATE.md decisions 24–25). Then Polly greets in Polish and in English and the app
  moves on. In Phase 3 that is always `/setup`; Phase 4 adds the picker and the map.
-->
<script lang="ts">
  import { push } from 'svelte-spa-router';
  import ChildLayout from '../lib/components/ChildLayout.svelte';
  import ContentImage from '../lib/components/ContentImage.svelte';
  import { prompt } from '../lib/content';
  import { sounds } from '../lib/sound/effects';
  import { speaker } from '../lib/speech';
  import { unlock } from '../lib/unlock';
  import type { Screen } from '../lib/screens';

  let { screen }: { screen: Screen; params?: Record<string, string> | null } = $props();

  let started = $state(false);

  async function start() {
    if (started) return;
    started = true;
    unlock();
    sounds().play('tap');
    await speaker().saySegments(
      [
        { lang: 'pl', text: prompt('start.hello') },
        { lang: 'en', text: 'Hello!' }
      ],
      'normal'
    );
    await push('/setup');
  }
</script>

<ChildLayout>
  <h1 class="sr-only">{screen.title}</h1>
  <button
    type="button"
    class="start-target flex flex-1 flex-col items-center justify-center"
    aria-label="Dotknij, żeby zacząć"
    data-testid="start"
    onclick={start}
  >
    <span class="start-polly" class:is-started={started}>
      <span class="start-ring" aria-hidden="true"></span>
      <ContentImage id="parrot" class="pointer-events-none relative size-56 object-contain drop-shadow-xl" />
    </span>
  </button>
</ChildLayout>
