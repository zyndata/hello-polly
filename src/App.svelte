<script lang="ts">
  import { onMount } from 'svelte';
  import Router from 'svelte-spa-router';
  import { routes } from './lib/routes';
  import { loadSpeechSettings } from './lib/speech';

  // Reads settings only; nothing speaks before the unlock gesture.
  onMount(() => {
    void loadSpeechSettings();
  });
</script>

<Router {routes} />
