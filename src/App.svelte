<script lang="ts">
  import { onMount } from 'svelte';
  import Router from 'svelte-spa-router';
  import { routes } from './lib/routes';
  import { loadSpeechSettings } from './lib/speech';
  import { startSync } from './lib/sync/state.svelte';

  // Reads settings only; nothing speaks before the unlock gesture. Sync reads its stored
  // connection and makes no Google request unless a token is already in hand (decision 66).
  onMount(() => {
    void loadSpeechSettings();
    void startSync();
  });
</script>

<Router {routes} />
