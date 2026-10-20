<!--
  /join/:fileId, accepting an invitation (PLAN.md "Sharing flow", STATE.md decisions 76–80).
  A parent screen, not behind the gate (a child does not open e-mail). „Połącz z Google” signs
  in without connecting the device; the Google Picker, filtered to the one file, then gives
  this app access to it; „Dołącz” (only when this device has children of its own) merges them
  in. A closed Picker changes nothing, and names the account in use, since the most likely
  reason is a different account than the one invited.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ContentImage from '../lib/components/ContentImage.svelte';
  import ParentLayout from '../lib/components/ParentLayout.svelte';
  import { loadFamily } from '../lib/db';
  import { liveChildren } from '../lib/domain/children';
  import type { AccountInfo } from '../lib/sync/backend';
  import { isDriveConfigured } from '../lib/sync/google-auth';
  import { isPickerConfigured } from '../lib/sync/picker';
  import {
    abandonJoin,
    canReach,
    completeJoin,
    familyFileId,
    pickToJoin,
    previewShared,
    signInToJoin,
    syncState
  } from '../lib/sync/state.svelte';
  import type { Screen } from '../lib/screens';

  let { screen, params }: { screen: Screen; params?: Record<string, string> | null } = $props();

  type Step = 'loading' | 'unavailable' | 'already' | 'intro' | 'working' | 'picking' | 'not-found' | 'confirm' | 'done' | 'failed';

  const fileId = $derived(decodeURIComponent(params?.fileId ?? ''));
  let step = $state<Step>('loading');
  let account = $state<AccountInfo | undefined>();
  let localOnly = $state<{ id: string; name: string; avatar: string }[]>([]);
  let children = $state<{ id: string; name: string; avatar: string }[]>([]);
  let failure = $state<string | undefined>();
  let joined = false;

  onMount(() => {
    void (async () => {
      if (!isDriveConfigured() || !isPickerConfigured() || fileId === '') {
        step = 'unavailable';
        return;
      }
      if ((await familyFileId()) === fileId && syncState.status !== 'revoked') {
        await showChildren();
        step = 'already';
        return;
      }
      step = 'intro';
    })();
  });

  onDestroy(() => {
    if (!joined) abandonJoin();
  });

  async function showChildren() {
    children = liveChildren(await loadFamily()).map((c) => ({ id: c.id, name: c.profile.name, avatar: c.profile.avatar }));
  }

  /** Every step that talks to Google runs from a parent's tap, and fails into a message. */
  async function run(action: () => Promise<void>) {
    failure = undefined;
    try {
      await action();
    } catch {
      failure = 'Nie udało się połączyć z Google. Sprawdź internet i spróbuj jeszcze raz.';
      step = account === undefined ? 'intro' : 'failed';
    }
  }

  const signIn = (switchAccount = false) =>
    run(async () => {
      step = 'working';
      try {
        account = await signInToJoin({ switchAccount });
      } catch {
        // The Google window was closed: nothing changed.
        failure = 'Nie zalogowano. Okno Google zostało zamknięte albo nie udało się z nim połączyć.';
        step = account === undefined ? 'intro' : 'not-found';
        return;
      }
      await reach();
    });

  /** The Picker, unless the file is already reachable (picked before, or the owner's own). */
  async function reach() {
    if (!(await canReach(fileId))) {
      step = 'picking';
      const picked = await pickToJoin(fileId);
      if (picked !== 'picked' || !(await canReach(fileId))) {
        step = 'not-found';
        return;
      }
    }
    step = 'working';
    const preview = await previewShared(fileId);
    localOnly = preview.localOnly;
    if (localOnly.length > 0) {
      step = 'confirm';
      return;
    }
    await join();
  }

  const pickAgain = () =>
    run(async () => {
      step = 'working';
      await reach();
    });

  async function join() {
    if (account === undefined) return;
    step = 'working';
    await completeJoin(fileId, account);
    joined = true;
    await showChildren();
    step = 'done';
  }

  const onJoin = () => run(join);
</script>

<ParentLayout title={screen.title}>
  <section class="card" aria-labelledby="join-title" data-testid="join" data-step={step}>
    <h2 id="join-title" class="card-title">Zaproszenie do wspólnej rodziny</h2>

    {#if step === 'unavailable'}
      <p>Ta wersja Hello Polly nie może dołączać do rodziny na Dysku Google, albo link z zaproszenia jest niepełny.</p>
      <a class="link self-start" href="#/">Przejdź do Hello Polly</a>
    {:else if step === 'already'}
      <p data-testid="join-already">Ta wspólna rodzina jest już na tym urządzeniu.</p>
      {@render childList()}
      <a class="button justify-self-start" href="#/">Przejdź do Hello Polly</a>
    {:else if step === 'intro'}
      <p>
        Drugi rodzic zaprasza cię do wspólnej rodziny w Hello Polly: będziecie widzieć te same dzieci, ustawienia i postępy.
      </p>
      <p>
        Zaloguj się kontem Google, na które przyszło zaproszenie. Potem Google pokaże plik rodziny: wybierz go i dotknij
        „Wybierz”. Tak Hello Polly dostaje dostęp tylko do tego jednego pliku.
      </p>
      <button type="button" class="button justify-self-start" onclick={() => signIn()} data-testid="join-sign-in">Połącz z Google</button>
    {:else if step === 'working'}
      <p aria-live="polite">Łączę z Dyskiem Google…</p>
    {:else if step === 'picking'}
      <p aria-live="polite">Wybierz plik rodziny w oknie Google i dotknij „Wybierz”.</p>
    {:else if step === 'not-found'}
      <p class="notice" data-testid="join-not-found">
        Plik rodziny nie został wybrany. Zalogowano jako <span class="font-bold" data-testid="join-account">{account?.label ?? 'nieznane konto'}</span>.
        Jeśli zaproszenie przyszło na inny adres e-mail, zmień konto. Jeśli okno zamknęło się przez przypadek, spróbuj jeszcze raz.
      </p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="button" onclick={pickAgain} data-testid="join-retry">Spróbuj jeszcze raz</button>
        <button type="button" class="button-quiet" onclick={() => signIn(true)} data-testid="join-switch">Zmień konto</button>
      </div>
    {:else if step === 'confirm'}
      <p>Na tym urządzeniu są już dzieci, których nie ma we wspólnej rodzinie:</p>
      <ul class="flex flex-wrap gap-3" data-testid="join-local">
        {#each localOnly as child (child.id)}
          <li class="flex items-center gap-2">
            <ContentImage id={child.avatar} class="size-10 object-contain" />
            <span class="font-bold">{child.name}</span>
          </li>
        {/each}
      </ul>
      <p>
        Po dołączeniu będą we wspólnej rodzinie razem z dziećmi drugiego rodzica, ze wszystkimi postępami. Jeśli ta rodzina
        była zapisana na twoim Dysku, jej dotychczasowy plik trafi do kosza Dysku (można go stamtąd przywrócić przez 30 dni).
      </p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="button" onclick={onJoin} data-testid="join-merge">Dołącz do wspólnej rodziny</button>
        <a class="button-quiet" href="#/">Anuluj</a>
      </div>
    {:else if step === 'done'}
      <p data-testid="join-done">Gotowe! Wspólna rodzina jest na tym urządzeniu.</p>
      {@render childList()}
      <p class="text-sm text-ink-muted">
        Jeśli masz Hello Polly zainstalowane na ekranie głównym, otwórz je i w pierwszym kroku wybierz „Mam już rodzinę na
        Dysku Google”: znajdzie tę samą rodzinę.
      </p>
      <a class="button justify-self-start" href="#/" data-testid="join-continue">Przejdź do Hello Polly</a>
    {:else if step === 'failed'}
      <div class="flex flex-wrap gap-2">
        <button type="button" class="button" onclick={pickAgain}>Spróbuj jeszcze raz</button>
        <a class="button-quiet" href="#/">Anuluj</a>
      </div>
    {/if}

    {#if failure}
      <p class="notice" role="alert" data-testid="join-failure">{failure}</p>
    {/if}
  </section>
</ParentLayout>

{#snippet childList()}
  {#if children.length > 0}
    <ul class="flex flex-wrap gap-3" data-testid="join-children">
      {#each children as child (child.id)}
        <li class="flex items-center gap-2" data-child={child.id}>
          <ContentImage id={child.avatar} class="size-10 object-contain" />
          <span class="font-bold">{child.name}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="text-ink-muted">We wspólnej rodzinie nie ma jeszcze dzieci; dodasz je w panelu rodzica.</p>
  {/if}
{/snippet}
