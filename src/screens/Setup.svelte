<!--
  /setup, the first run (PLAN.md "First run"): the voice check, „Mam zaproszenie”, „Mam już
  rodzinę na Dysku Google” (STATE.md decision 68: another device of the same account loads the
  family instead of adding the child twice) or „Zaczynamy”, the first child, the starting topics (and, if the parent wants,
  specific words in the queue), and one sentence about the parent gate. The last tap creates
  the child and hands the phone over to the child's map. Once a child exists, this screen
  sends the visitor to `/` (STATE.md decision 37: it is not behind the gate).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { push, replace } from 'svelte-spa-router';
  import ChildForm from '../lib/components/ChildForm.svelte';
  import ContentImage from '../lib/components/ContentImage.svelte';
  import ParentLayout from '../lib/components/ParentLayout.svelte';
  import VoiceCheck from '../lib/components/VoiceCheck.svelte';
  import WordPlanEditor from '../lib/components/WordPlanEditor.svelte';
  import { getPreferredVoices, loadFamily, type PreferredVoiceIds } from '../lib/db';
  import { addChild, liveChildren } from '../lib/domain/children';
  import { defaultPlan, readSettings } from '../lib/domain/family';
  import { sounds } from '../lib/sound/effects';
  import { unlock } from '../lib/unlock';
  import { change } from '../lib/store';
  import { isDriveConfigured } from '../lib/sync/google-auth';
  import { connect, syncState } from '../lib/sync/state.svelte';
  import type { Screen } from '../lib/screens';
  import type { Accent, ChildProfile, WordPlan } from '../lib/types';

  let { screen }: { screen: Screen; params?: Record<string, string> | null } = $props();

  type Step = 'voice' | 'start' | 'invite' | 'child' | 'words' | 'gate';
  const NUMBERED: Step[] = ['voice', 'start', 'child', 'words', 'gate'];

  let step = $state<Step>('voice');
  let ready = $state(false);
  let accent = $state<Accent>('en-GB');
  let preferred = $state<PreferredVoiceIds>({});
  let profile = $state<Omit<ChildProfile, 'deleted'> | undefined>();
  let plan = $state<WordPlan>(defaultPlan());
  let saving = $state(false);
  let loadingDrive = $state(false);
  let driveNote = $state<string | undefined>();

  const number = $derived(NUMBERED.indexOf(step === 'invite' ? 'start' : step) + 1);

  onMount(() => {
    void (async () => {
      const [family, voices] = await Promise.all([loadFamily(), getPreferredVoices()]);
      if (liveChildren(family).length > 0) return replace('/');
      accent = readSettings(family).accent;
      preferred = voices;
      ready = true;
    })();
  });

  async function fromDrive() {
    if (loadingDrive) return;
    loadingDrive = true;
    driveNote = undefined;
    unlock();
    try {
      await connect();
      if (syncState.status === 'error') {
        driveNote = syncState.message;
        return;
      }
      if (liveChildren(await loadFamily()).length > 0) {
        await replace('/');
        return;
      }
      driveNote = 'Połączono, ale na tym koncie nie ma jeszcze dzieci. Dodaj pierwsze dziecko: zapisze się na Dysku.';
      step = 'child';
    } catch {
      driveNote = 'Nie połączono. Okno Google zostało zamknięte albo nie udało się z nim połączyć.';
    } finally {
      loadingDrive = false;
    }
  }

  async function finish() {
    if (!profile || saving) return;
    saving = true;
    // The tap that hands the phone over is a gesture: it unlocks speech for the child's map.
    unlock();
    sounds().play('tap');
    const id = crypto.randomUUID();
    const chosen = profile;
    await change((file, now, device) => addChild(file, id, chosen, now, device, $state.snapshot(plan)));
    await push(`/child/${id}`);
  }
</script>

<ParentLayout title={screen.title}>
  {#if ready}
    <p class="text-sm font-bold text-ink-muted" data-testid="setup-step">Krok {number} z {NUMBERED.length}</p>

    {#if step === 'voice'}
      <section class="card" aria-labelledby="voice-title">
        <h2 id="voice-title" class="card-title">Sprawdźmy głos</h2>
        <p>
          Hello Polly mówi głosem tego urządzenia: po angielsku słówka, po polsku polecenia dla dziecka. Posłuchaj,
          czy oba głosy są.
        </p>
        <VoiceCheck {accent} {preferred} />
        <p class="text-sm text-ink-muted">
          Akcent, tempo i wybór głosu zmienisz później w panelu rodzica, w części „Mowa i głosy”.
        </p>
        <button type="button" class="button justify-self-start" onclick={() => (step = 'start')}>Dalej</button>
      </section>
    {:else if step === 'start'}
      <section class="card" aria-labelledby="start-title">
        <h2 id="start-title" class="card-title">Zaczynamy?</h2>
        <p>Jeśli drugi rodzic już używa Hello Polly i zaprosił cię do wspólnej rodziny, wybierz „Mam zaproszenie”.</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="button" onclick={() => (step = 'child')}>Zaczynamy</button>
          <button type="button" class="button-quiet" onclick={() => (step = 'invite')}>Mam zaproszenie</button>
        </div>
        {#if isDriveConfigured()}
          <p>Jeśli Hello Polly działa już na innym twoim urządzeniu i zapisuje rodzinę na Dysku Google, wczytaj ją stąd.</p>
          <button type="button" class="button-quiet justify-self-start" disabled={loadingDrive} onclick={fromDrive} data-testid="setup-drive">
            Mam już rodzinę na Dysku Google
          </button>
        {/if}
        {#if driveNote}<p class="notice" data-testid="setup-drive-note">{driveNote}</p>{/if}
      </section>
    {:else if step === 'invite'}
      <section class="card" aria-labelledby="invite-title">
        <h2 id="invite-title" class="card-title">Mam zaproszenie</h2>
        <p>
          Zaproszenie to link w e-mailu od Dysku Google. Otwórz go na tym urządzeniu: Hello Polly połączy się wtedy ze
          wspólną rodziną i nie trzeba nic tu wpisywać.
        </p>
        <p class="text-sm text-ink-muted">Wspólna rodzina na Dysku Google pojawi się w jednej z kolejnych wersji.</p>
        <button type="button" class="button-quiet justify-self-start" onclick={() => (step = 'start')}>Wróć</button>
      </section>
    {:else if step === 'child'}
      <section class="card" aria-labelledby="child-title">
        <h2 id="child-title" class="card-title">Kto będzie się uczyć?</h2>
        {#if driveNote}<p class="notice" data-testid="setup-drive-note">{driveNote}</p>{/if}
        <ChildForm
          initial={profile}
          submitLabel="Dalej"
          onsubmit={(p) => {
            profile = p;
            step = 'words';
          }}
        />
      </section>
    {:else if step === 'words'}
      <section class="card" aria-labelledby="words-title">
        <h2 id="words-title" class="card-title">Od czego zaczynamy?</h2>
        <p>
          Włączone są kolory, liczby, owoce i zwierzęta. Możesz to zmienić, a jeśli chcesz, wybrać konkretne słówka na
          początek („Do kolejki”). Wszystko da się później poprawić.
        </p>
        <WordPlanEditor {plan} onchange={(p) => (plan = p)} />
        <div class="flex flex-wrap gap-2">
          <button type="button" class="button" onclick={() => (step = 'gate')}>Dalej</button>
          <button type="button" class="button-quiet" onclick={() => (step = 'child')}>Wróć</button>
        </div>
      </section>
    {:else}
      <section class="card" aria-labelledby="gate-title">
        <h2 id="gate-title" class="card-title">Ostatnia rzecz</h2>
        <p>
          Ustawienia są za bramką dla rodzica: koło zębate w rogu mapy, a potem liczba zapisana słowami, której dziecko
          jeszcze nie przeczyta.
        </p>
        <div class="flex items-center gap-3">
          <ContentImage id="gear" class="size-12 object-contain" />
          <ContentImage id={profile?.avatar ?? 'parrot'} class="size-12 object-contain" />
          <span class="font-bold">{profile?.name}</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="button" disabled={saving} onclick={finish} data-testid="handover">Przekaż telefon dziecku</button>
          <button type="button" class="button-quiet" onclick={() => (step = 'words')}>Wróć</button>
        </div>
      </section>
    {/if}
  {/if}
</ParentLayout>
