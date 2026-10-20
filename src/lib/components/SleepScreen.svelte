<!--
  The lock (PLAN.md "Screen time and the parent gate"; STATE.md decision 94): the sea at night,
  Polly asleep, and „Koniec na dziś! Polly idzie spać.” A tap on Polly says it again. The only
  way on is the gear and the parent gate (passing it wakes Polly), or the next day. No home
  button: the lock is not a way into another child's profile.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import ChildLayout from './ChildLayout.svelte';
  import ContentImage from './ContentImage.svelte';
  import { prompt } from '../content';
  import { sounds } from '../sound/effects';
  import { speaker } from '../speech';
  import { speed } from '../speech/speed.svelte';
  import { syncState } from '../sync/state.svelte';
  import { unlock } from '../unlock';

  let nudge = $state(0);

  onMount(() => {
    if (speaker().isUnlocked) void speaker().sayPrompt(prompt('sleep.night'), speed.value);
  });

  function polly() {
    unlock();
    nudge += 1;
    void speaker().sayPrompt(prompt('sleep.night'), speed.value);
  }

  function gear() {
    unlock();
    sounds().play('tap');
    void speaker().sayPrompt(prompt('gate.parents'), speed.value);
    void push('/parent');
  }
</script>

<ChildLayout night>
  <h1 class="sr-only">Polly śpi</h1>
  <header class="flex justify-end p-3">
    <button type="button" class="relative size-tap rounded-full bg-foam/85 p-2 shadow-md" aria-label="Dla rodzica" data-testid="gear" onclick={gear}>
      <ContentImage id="gear" class="pointer-events-none h-full w-full object-contain" />
      {#if syncState.attention}
        <span class="absolute top-1 right-1 size-4 rounded-full border-2 border-white bg-coral" data-testid="gear-dot"></span>
      {/if}
    </button>
  </header>

  <div class="flex flex-1 flex-col items-center justify-center p-6" data-testid="sleep">
    <svg viewBox="0 0 100 100" class="sleep-moon pointer-events-none size-24" aria-hidden="true" focusable="false">
      <path d="M62 10 A40 40 0 1 0 90 72 A32 32 0 1 1 62 10 Z" class="fill-gold" />
    </svg>
    <button type="button" class="sleep-polly relative" aria-label="Polly śpi" data-testid="sleep-polly" onclick={polly}>
      {#key nudge}
        <span class="sleep-polly-body block" class:is-nudged={nudge > 0}>
          <ContentImage id="parrot" class="pointer-events-none size-56 object-contain drop-shadow-xl" />
        </span>
      {/key}
      <span class="sleep-zzz pointer-events-none" aria-hidden="true">
        <ContentImage id="zzz" class="h-full w-full object-contain" />
      </span>
    </button>
  </div>
</ChildLayout>
