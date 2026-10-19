<script lang="ts">
  import ChildLayout from './ChildLayout.svelte';
  import ParentLayout from './ParentLayout.svelte';
  import type { Screen } from '../screens';

  // `params` is passed by the router to every route component; a placeholder has no use for it.
  let { screen }: { screen: Screen; params?: Record<string, string> | null } = $props();
</script>

{#if screen.area === 'child'}
  <ChildLayout>
    <div class="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <!-- A placeholder is the only child screen allowed to carry text: the real one, built in
           its phase, is spoken and shown with pictures. -->
      <h1 class="rounded-card bg-foam/90 px-8 py-5 text-4xl font-extrabold text-deep-sea shadow-lg">
        {screen.title}
      </h1>
      <p class="rounded-full bg-deep-sea/60 px-5 py-2 text-lg font-semibold text-foam">
        Ten ekran powstanie w fazie {screen.phase}.
      </p>
    </div>
  </ChildLayout>
{:else}
  <ParentLayout title={screen.title}>
    <p class="text-ink-muted">
      {#if screen.path === '*'}
        Ten adres nie prowadzi do żadnego ekranu.
      {:else}
        Ten ekran powstanie w fazie {screen.phase}.
      {/if}
    </p>
    {#if screen.path === '/parent' || screen.path === '/setup'}
      <!-- Until Phase 4 builds these, the one finished parent screen is reached from here. -->
      <p><a class="link" href="#/parent/speech">Sprawdź mowę i głosy</a></p>
    {/if}
    <p><a class="link" href="#/">Wróć do ekranu startowego</a></p>
  </ParentLayout>
{/if}
