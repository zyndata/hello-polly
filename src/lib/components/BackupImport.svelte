<!--
  „Wczytaj kopię” (STATE.md decision 97): a backup file is chosen, its children are listed, and
  „Wczytaj” merges it into this device's family, the same join as sync, so nothing already here
  is lost. `onimported` gets the file as it is after the import.
-->
<script lang="ts">
  import ContentImage from './ContentImage.svelte';
  import { readBackup } from '../backup';
  import { liveChildren, type ChildEntry } from '../domain/children';
  import { importFamily } from '../domain/backup';
  import { loadSpeechSettings } from '../speech';
  import { change } from '../store';
  import type { FamilyFile } from '../types';

  let { onimported }: { onimported: (file: FamilyFile) => void } = $props();

  let backup = $state<FamilyFile | undefined>();
  let found = $state<ChildEntry[]>([]);
  let error = $state<string | undefined>();
  let busy = $state(false);
  let input = $state<HTMLInputElement | undefined>();

  async function chosen(event: Event & { currentTarget: HTMLInputElement }) {
    const picked = event.currentTarget.files?.[0];
    backup = undefined;
    error = undefined;
    if (!picked) return;
    const result = await readBackup(picked);
    if ('error' in result) {
      error = result.error;
      return;
    }
    backup = result.file;
    found = liveChildren(result.file);
  }

  function cancel() {
    backup = undefined;
    error = undefined;
    if (input) input.value = '';
  }

  async function load() {
    const chosenBackup = backup;
    if (!chosenBackup || busy) return;
    busy = true;
    try {
      const file = await change((local) => importFamily(local, $state.snapshot(chosenBackup) as FamilyFile));
      cancel();
      // The backup may carry other speech settings (accent, speeds).
      void loadSpeechSettings();
      onimported(file);
    } catch (e) {
      console.error(e);
      error = 'Nie udało się wczytać kopii. Odśwież stronę i spróbuj jeszcze raz.';
    } finally {
      busy = false;
    }
  }
</script>

<div class="grid gap-2" data-testid="backup-import">
  <label class="grid gap-1">
    <span class="font-bold">Plik kopii zapasowej</span>
    <input bind:this={input} type="file" accept="application/json,.json" onchange={chosen} data-testid="backup-file" />
  </label>
  {#if error}<p class="notice text-sm" data-testid="backup-error">{error}</p>{/if}
  {#if backup}
    <p>
      {#if found.length === 0}
        W tej kopii nie ma dzieci.
      {:else}
        W kopii: {found.length === 1 ? 'jedno dziecko' : `dzieci: ${found.length}`}.
      {/if}
    </p>
    {#if found.length > 0}
      <ul class="flex flex-wrap gap-2" data-testid="backup-children">
        {#each found as child (child.id)}
          <li class="flex items-center gap-2 rounded-xl bg-foam p-2">
            <ContentImage id={child.profile.avatar} class="size-8 object-contain" />
            <span class="font-bold">{child.profile.name}</span>
          </li>
        {/each}
      </ul>
    {/if}
    <p class="text-sm text-ink-muted">
      Kopia zostanie połączona z tym, co jest na tym urządzeniu: nic, co już tu jest, nie zniknie.
    </p>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="button" disabled={busy} onclick={load} data-testid="backup-load">Wczytaj</button>
      <button type="button" class="button-quiet" onclick={cancel}>Anuluj</button>
    </div>
  {/if}
</div>
