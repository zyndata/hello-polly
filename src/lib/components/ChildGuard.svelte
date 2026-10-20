<!--
  Every /child/:id/* route (STATE.md decisions 91–94): it counts the child's play time while
  the screen is on show, and shows the lock instead of the screen once Polly is asleep. A screen
  opened while she sleeps never starts; one in the middle of something (`holdScreen`) finishes
  it first, and the screen it then goes to is the lock.
-->
<script lang="ts">
  import type { Component } from 'svelte';
  import SleepScreen from './SleepScreen.svelte';
  import { screenTime } from '../screentime/clock.svelte';
  import { provideHold } from '../screentime/hold';
  import type { Screen } from '../screens';

  type Props = { screen: Screen; params?: Record<string, string> | null | undefined };

  let { screen, params, inner }: Props & { inner: Component<Props> } = $props();

  const Inner = $derived(inner);
  const child = $derived(params?.id ?? '');

  let ready = $state(false);
  let holding = $state(false);

  provideHold((h) => (holding = h));

  $effect(() => {
    const id = child;
    let gone = false;
    ready = false;
    void screenTime.show(id).then(() => {
      if (!gone) ready = true;
    });
    return () => {
      gone = true;
      screenTime.hide(id);
    };
  });

  const asleep = $derived(ready && screenTime.isAsleep(child) && !holding);
</script>

{#if asleep}
  <SleepScreen />
{:else if ready}
  <Inner {screen} {params} />
{/if}
