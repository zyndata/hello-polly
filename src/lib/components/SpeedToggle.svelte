<!--
  🐢/🐇: the two speeds as two big pictures. The chosen one is raised and ringed; switching
  says „Powoli.” or „Normalnie.” so the child hears what changed.
-->
<script lang="ts">
  import ContentImage from './ContentImage.svelte';
  import { prompt } from '../content';
  import { sounds } from '../sound/effects';
  import { speaker } from '../speech';
  import { speed } from '../speech/speed.svelte';
  import { unlock } from '../unlock';
  import type { Speed } from '../types';

  let { class: className = '' }: { class?: string } = $props();

  const options: { value: Speed; image: string; label: string }[] = [
    { value: 'slow', image: 'turtle', label: 'Powoli' },
    { value: 'normal', image: 'rabbit', label: 'Normalnie' }
  ];

  function choose(value: Speed) {
    unlock();
    sounds().play('tap');
    speed.set(value);
    void speaker().sayPrompt(prompt(value === 'slow' ? 'speed.slow' : 'speed.normal'), value);
  }
</script>

<div class="flex gap-3 {className}" role="group" aria-label="Tempo mowy">
  {#each options as option (option.value)}
    <button
      type="button"
      class="speed-option size-tap rounded-full bg-foam/80 p-2 shadow-md"
      class:is-chosen={speed.value === option.value}
      aria-label={option.label}
      aria-pressed={speed.value === option.value}
      data-speed={option.value}
      onclick={() => choose(option.value)}
    >
      <ContentImage id={option.image} class="pointer-events-none h-full w-full object-contain" />
    </button>
  {/each}
</div>
