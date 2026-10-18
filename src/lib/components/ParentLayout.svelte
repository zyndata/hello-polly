<script lang="ts">
  import type { Snippet } from 'svelte';

  /** The base of every parent screen: an ordinary Polish page, readable on a phone. */
  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div class="parent flex min-h-dvh flex-col">
  <header class="bg-deep-sea text-foam">
    <div class="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
      <span class="text-sm font-bold tracking-wide text-sky">Hello Polly</span>
      <span aria-hidden="true" class="text-sky/60">·</span>
      <span class="text-sm text-foam/90">dla rodzica</span>
    </div>
  </header>
  <main class="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
    <h1 class="text-2xl font-extrabold text-deep-sea">{title}</h1>
    {@render children()}
  </main>
</div>
