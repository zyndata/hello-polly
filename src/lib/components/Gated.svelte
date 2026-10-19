<!--
  Every /parent/* route (STATE.md decision 37): the screen itself once the gate is passed,
  the gate until then.
-->
<script lang="ts">
  import type { Component } from 'svelte';
  import ParentGate from './ParentGate.svelte';
  import ParentLayout from './ParentLayout.svelte';
  import { parentGate } from '../gate/open.svelte';
  import type { Screen } from '../screens';

  type Props = { screen: Screen; params?: Record<string, string> | null | undefined };

  let { screen, params, inner }: Props & { inner: Component<Props> } = $props();

  const Inner = $derived(inner);
</script>

{#if parentGate.isOpen}
  <Inner {screen} {params} />
{:else}
  <ParentLayout title={screen.title}>
    <ParentGate />
  </ParentLayout>
{/if}
