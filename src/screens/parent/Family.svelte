<!--
  /parent/family (behind the gate), *Rodzina*: saving the family on Google Drive. Connect,
  the state of the last sync, renew an expired connection, sync now, disconnect. Everything
  about sync that a parent may need to see is here, never on a child screen (STATE.md
  decisions 66, 67). Inviting the second parent is Phase 8.
-->
<script lang="ts">
  import ParentLayout from '../../lib/components/ParentLayout.svelte';
  import type { Member } from '../../lib/sync/backend';
  import { FAMILY_FILE_NAME } from '../../lib/sync/engine';
  import {
    connect,
    disconnect,
    familyFileId,
    invite,
    joinLink,
    listMembers,
    removeMember,
    renew,
    syncNow,
    syncState,
    type SyncStatus
  } from '../../lib/sync/state.svelte';
  import type { Screen } from '../../lib/screens';

  let { screen }: { screen: Screen; params?: Record<string, string> | null } = $props();

  let busy = $state(false);
  let failure = $state<string | undefined>();
  let confirming = $state(false);

  const LABELS: Record<SyncStatus, string> = {
    unconfigured: 'Niedostępne',
    off: 'Niepołączono',
    paused: 'Wstrzymano',
    syncing: 'Zapisuję…',
    ok: 'Połączono',
    error: 'Błąd',
    revoked: 'Dostęp cofnięty'
  };

  const when = (iso: string | undefined): string =>
    iso === undefined ? 'jeszcze nie' : new Date(iso).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });

  async function act(action: () => Promise<unknown>, failed: string) {
    if (busy) return;
    busy = true;
    failure = undefined;
    try {
      await action();
    } catch {
      failure = failed;
    } finally {
      busy = false;
    }
  }

  const onConnect = () => act(connect, 'Nie połączono. Okno Google zostało zamknięte albo nie udało się z nim połączyć.');
  const onRenew = () =>
    act(async () => {
      if (!(await renew())) throw new Error('not renewed');
    }, 'Nie udało się wznowić połączenia. Spróbuj jeszcze raz.');
  const onSync = () => act(syncNow, 'Nie udało się zapisać.');
  const onDisconnect = () =>
    act(async () => {
      await disconnect();
      confirming = false;
    }, 'Nie udało się odłączyć.');

  // --- The second parent (decision 79) ---

  let fileId = $state<string | undefined>();
  let members = $state<Member[] | undefined>();
  let membersFailed = $state(false);
  let email = $state('');
  let inviting = $state(false);
  let invited = $state<string | undefined>();
  let inviteFailure = $state<string | undefined>();
  let removing = $state<string | undefined>();
  let copied = $state(false);

  const canShare = $derived(syncState.status === 'ok' || syncState.status === 'syncing' || syncState.status === 'paused');
  const iAmOwner = $derived(members?.some((m) => m.id === syncState.accountId && m.role === 'owner') === true);

  /** Only with a token in hand: opening this screen is not a reason to ask Google for one. */
  async function loadMembers() {
    fileId = await familyFileId();
    if (fileId === undefined || syncState.status !== 'ok') return;
    try {
      members = await listMembers();
      membersFailed = false;
    } catch {
      membersFailed = true;
    }
  }

  // Once a token is in hand; after that, only invitations and removals reload the list.
  $effect(() => {
    if (syncState.status === 'ok' && members === undefined && !membersFailed) void loadMembers();
  });

  async function onInvite(event: SubmitEvent) {
    event.preventDefault();
    if (inviting || email.trim() === '') return;
    inviting = true;
    invited = undefined;
    inviteFailure = undefined;
    try {
      const member = await invite(email);
      invited = member.email;
      email = '';
      await loadMembers();
    } catch {
      inviteFailure = 'Nie udało się wysłać zaproszenia. Sprawdź adres e-mail i połączenie z internetem, i spróbuj jeszcze raz.';
    } finally {
      inviting = false;
    }
  }

  async function onRemove(member: Member) {
    if (removing !== member.id) {
      removing = member.id;
      return;
    }
    await act(async () => {
      await removeMember(member.id);
      removing = undefined;
      await loadMembers();
    }, 'Nie udało się usunąć tej osoby z rodziny.');
  }

  // The system share sheet (SMS, WhatsApp, …), where a link is clickable, unlike in Drive's
  // e-mail. Shown only where the browser has one; cancelling it is not a failure.
  const hasShareSheet = typeof navigator.share === 'function';

  async function onShare() {
    if (fileId === undefined) return;
    try {
      await navigator.share({
        title: 'Hello Polly',
        text: 'Zapraszam cię do naszej wspólnej rodziny w Hello Polly. Otwórz ten link na telefonie lub tablecie, na którym chcesz używać Hello Polly:',
        url: joinLink(fileId)
      });
    } catch {
      // Closed by the parent, or no target picked: nothing to say.
    }
  }

  async function onCopy() {
    if (fileId === undefined) return;
    try {
      await navigator.clipboard.writeText(joinLink(fileId));
      copied = true;
    } catch {
      copied = false;
    }
  }
</script>

<ParentLayout title={screen.title}>
  <section class="card" aria-labelledby="drive-title" data-testid="drive" data-status={syncState.status}>
    <h2 id="drive-title" class="card-title">Zapis na Dysku Google</h2>

    {#if syncState.status === 'unconfigured'}
      <p>Ta wersja Hello Polly nie ma połączenia z Google. Wszystko zapisuje się na tym urządzeniu.</p>
    {:else if syncState.status === 'off'}
      <p>
        Hello Polly może zapisywać rodzinę (dzieci, ustawienia i postępy) w jednym pliku na twoim Dysku Google,
        <span class="font-bold">{FAMILY_FILE_NAME}</span>. Wtedy każde urządzenie połączone z tym samym kontem ma te same
        dzieci i postępy.
      </p>
      <p class="text-sm text-ink-muted">
        Aplikacja widzi tylko pliki, które sama utworzyła. Dziecko nigdy nie zobaczy logowania ani błędów: wszystko o
        synchronizacji jest tutaj.
      </p>
      <button type="button" class="button justify-self-start" disabled={busy} onclick={onConnect} data-testid="connect">
        Połącz z Dyskiem Google
      </button>
    {:else}
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt class="font-bold">Stan</dt>
        <dd data-testid="sync-status">{LABELS[syncState.status]}</dd>
        <dt class="font-bold">Konto</dt>
        <dd data-testid="sync-account">{syncState.account || '—'}</dd>
        <dt class="font-bold">Ostatni zapis</dt>
        <dd data-testid="sync-last">{when(syncState.lastSync)}</dd>
      </dl>
      {#if syncState.message && (syncState.status === 'paused' || syncState.status === 'error' || syncState.status === 'revoked')}
        <p class="notice" data-testid="sync-message">{syncState.message}</p>
      {/if}
      {#if syncState.unsynced}
        <p class="text-sm text-ink-muted" data-testid="sync-unsynced">Na tym urządzeniu są postępy, których jeszcze nie ma na Dysku.</p>
      {/if}
      <div class="flex flex-wrap gap-2">
        {#if syncState.status === 'paused'}
          <button type="button" class="button" disabled={busy} onclick={onRenew} data-testid="renew">Wznów</button>
        {:else if syncState.status !== 'revoked'}
          <button type="button" class="button" disabled={busy || syncState.status === 'syncing'} onclick={onSync} data-testid="sync-now">
            Zapisz teraz
          </button>
        {/if}
        {#if confirming}
          <button type="button" class="button-quiet" disabled={busy} onclick={onDisconnect} data-testid="disconnect-confirm">
            Na pewno odłączyć?
          </button>
          <button type="button" class="button-quiet" onclick={() => (confirming = false)}>Anuluj</button>
        {:else}
          <button type="button" class="button-quiet" onclick={() => (confirming = true)} data-testid="disconnect">Odłącz</button>
        {/if}
      </div>
      {#if confirming}
        <p class="text-sm text-ink-muted">
          Dzieci i postępy zostaną na tym urządzeniu; plik na Dysku też zostaje. Przestaną się tylko synchronizować.
        </p>
      {/if}
    {/if}
    {#if failure}
      <p class="notice" role="alert" data-testid="sync-failure">{failure}</p>
    {/if}
  </section>

  <section class="card" aria-labelledby="second-title" data-testid="second-parent">
    <h2 id="second-title" class="card-title">Drugi rodzic</h2>
    {#if syncState.status === 'revoked'}
      <p>
        Ta rodzina nie jest już wspólna. „Odłącz” powyżej zostawia wszystko na tym urządzeniu; nowe zaproszenie od
        drugiego rodzica połączy was znowu.
      </p>
    {:else if !syncState.connected}
      <p class="text-ink-muted">
        Najpierw zapisz rodzinę na Dysku Google (powyżej). Potem zaprosisz tutaj drugiego rodzica: będziecie widzieć te
        same dzieci, ustawienia i postępy, każde na swoim telefonie i swoim koncie Google.
      </p>
    {:else}
      <p>
        Zaproś drugiego rodzica jego adresem e-mail z kontem Google. Dysk Google wyśle mu wiadomość z linkiem; po
        otwarciu linku wybierze plik rodziny i zobaczy te same dzieci, ustawienia i postępy.
      </p>

      {#if members}
        <ul class="grid gap-2" data-testid="members">
          {#each members as member (member.id)}
            <li class="flex flex-wrap items-center gap-x-3 gap-y-1" data-member={member.email}>
              <span class="font-bold">{member.name ?? member.email}</span>
              {#if member.name}<span class="text-sm text-ink-muted">{member.email}</span>{/if}
              <span class="text-sm text-ink-muted" data-testid="member-role">
                {member.role === 'owner' ? 'właściciel pliku' : 'może zmieniać'}{member.id === syncState.accountId ? ' · to ty' : ''}
              </span>
              {#if iAmOwner && member.role !== 'owner'}
                <button type="button" class="button-quiet" disabled={busy} onclick={() => onRemove(member)} data-testid="remove-member">
                  {removing === member.id ? 'Na pewno usunąć?' : 'Usuń'}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
        {#if removing}
          <p class="text-sm text-ink-muted">
            Ta osoba straci dostęp do pliku rodziny, a jej urządzenia przestaną się synchronizować. Dzieci i postępy tutaj
            zostają.
          </p>
        {/if}
      {:else if membersFailed}
        <p class="notice">Nie udało się wczytać listy osób z dostępem. Spróbuj „Zapisz teraz” i wróć tutaj.</p>
      {:else if syncState.status === 'paused'}
        <p class="text-sm text-ink-muted">Lista osób pojawi się po wznowieniu połączenia.</p>
      {/if}

      {#if canShare}
        <form class="grid gap-2" onsubmit={onInvite} data-testid="invite-form">
          <label class="grid gap-1">
            <span class="font-bold">Adres e-mail drugiego rodzica</span>
            <input class="select" type="email" name="email" autocomplete="email" required bind:value={email} />
          </label>
          <button type="submit" class="button justify-self-start" disabled={inviting} data-testid="invite">Zaproś</button>
        </form>
        {#if invited}
          <p data-testid="invite-sent">Wysłano zaproszenie na adres {invited}.</p>
        {/if}
        {#if inviteFailure}
          <p class="notice" role="alert" data-testid="invite-failure">{inviteFailure}</p>
        {/if}
        {#if fileId}
          <p class="text-sm text-ink-muted">
            Link z zaproszenia możesz też wysłać sam, na przykład SMS-em albo komunikatorem — tam będzie klikalny. Bez zaproszenia na Dysku nikomu nic nie da.
          </p>
          <p class="break-all text-sm" data-testid="invite-link">{joinLink(fileId)}</p>
          <div class="flex flex-wrap gap-2">
            {#if hasShareSheet}
              <button type="button" class="button justify-self-start" onclick={onShare} data-testid="invite-share">Udostępnij</button>
            {/if}
            <button type="button" class="button-quiet justify-self-start" onclick={onCopy}>{copied ? 'Skopiowano' : 'Kopiuj link'}</button>
          </div>
        {/if}
      {/if}
    {/if}
  </section>

  <a class="link self-start" href="#/parent">‹ Panel rodzica</a>
</ParentLayout>
