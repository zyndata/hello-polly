<!--
  /parent/child/:id (behind the gate): one child's word plan (topics, queue, known, paused,
  random order), what comes next, the screen-time limits (STATE.md decision 95), the progress
  dashboard (decision 96), and the profile, including deleting it (a tombstone, after an
  inline „Na pewno?”, decisions 34 and 38).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import ChildForm from '../../lib/components/ChildForm.svelte';
  import ContentImage from '../../lib/components/ContentImage.svelte';
  import ParentLayout from '../../lib/components/ParentLayout.svelte';
  import ProgressDashboard from '../../lib/components/ProgressDashboard.svelte';
  import WordPlanEditor from '../../lib/components/WordPlanEditor.svelte';
  import { topics, word } from '../../lib/content';
  import { loadFamily } from '../../lib/db';
  import { childLimits, childPlan, deleteChild, liveChild, setLimits, setPlan, updateChild } from '../../lib/domain/children';
  import { nextWords, wordStates, type WordState } from '../../lib/domain/learning';
  import { localDay } from '../../lib/domain/time';
  import { change } from '../../lib/store';
  import type { Screen } from '../../lib/screens';
  import type { ChildLimits, ChildProfile, DeviceId, DeviceProgress, FamilyFile, WordId, WordPlan } from '../../lib/types';

  let { screen, params }: { screen: Screen; params?: Record<string, string> | null } = $props();

  /** How many upcoming words the preview lists. */
  const PREVIEW = 6;
  /** The limits a parent can choose, in minutes (decision 95); `null` is „brak limitu”. */
  const DAILY_CHOICES = [null, 10, 15, 20, 30, 45, 60];
  const SESSION_CHOICES = [null, 5, 10, 15, 20, 30];

  const childId = $derived(params?.id ?? '');
  let loaded = $state(false);
  let profile = $state<ChildProfile | undefined>();
  let plan = $state<WordPlan | undefined>();
  let states = $state<ReadonlyMap<WordId, WordState>>(new Map());
  let limits = $state<ChildLimits | undefined>();
  let progress = $state<Record<DeviceId, DeviceProgress> | undefined>();
  const today = localDay(new Date());
  let editing = $state(false);
  let confirming = $state(false);
  /** The outcome of the last save, announced (and shown when it failed). */
  let status = $state<'' | 'saved' | 'failed'>('');

  const upcoming = $derived(plan ? nextWords(plan, states, topics, childId, PREVIEW) : []);

  function show(file: FamilyFile) {
    profile = liveChild(file, childId);
    plan = childPlan(file, childId);
    states = wordStates(file.progress[childId]);
    limits = childLimits(file, childId);
    progress = file.progress[childId];
  }

  async function saveLimit(key: keyof ChildLimits, value: string) {
    if (!limits) return;
    const next: ChildLimits = { ...limits, [key]: value === '' ? null : Number(value) };
    await save((file, now, device) => setLimits(file, childId, next, now, device));
  }

  /** The choices, with the stored value among them even if it is not one of the usual ones. */
  const choicesWith = (choices: (number | null)[], current: number | null) =>
    choices.includes(current) ? choices : [...choices, current].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
  const choiceLabel = (n: number | null) => (n === null ? 'brak limitu' : `${n} min`);

  onMount(() => {
    void (async () => {
      show(await loadFamily());
      loaded = true;
    })();
  });

  async function savePlan(edited: WordPlan) {
    // The editor builds on this screen's state; IndexedDB stores plain values only.
    const next = $state.snapshot(edited);
    plan = next;
    await save((file, now, device) => setPlan(file, childId, next, now, device));
  }

  async function save(edit: Parameters<typeof change>[0]): Promise<boolean> {
    try {
      show(await change(edit));
      status = 'saved';
      return true;
    } catch (error) {
      console.error(error);
      status = 'failed';
      return false;
    }
  }

  async function saveProfile(next: Omit<ChildProfile, 'deleted'>) {
    if (await save((file, now, device) => updateChild(file, childId, next, now, device))) editing = false;
  }

  async function remove() {
    await change((file, now, device) => deleteChild(file, childId, now, device));
    await push('/parent');
  }
</script>

<ParentLayout title={profile ? profile.name : screen.title}>
  {#if loaded && !profile}
    <p class="text-ink-muted">Nie ma takiego dziecka.</p>
  {:else if profile && plan}
    <section class="card" aria-labelledby="next-title">
      <h2 id="next-title" class="card-title">Następne nowe słówka</h2>
      {#if upcoming.length === 0}
        <p class="text-ink-muted">Nie ma nowych słówek: włącz temat albo dodaj słówka do kolejki.</p>
      {:else}
        <ol class="flex flex-wrap gap-2" data-testid="upcoming">
          {#each upcoming as id (id)}
            {@const w = word(id)}
            {#if w}
              <li class="grid justify-items-center rounded-xl bg-foam p-2 text-sm" data-word={id}>
                <ContentImage id={w.image} class="size-10 object-contain" />
                {w.en}
              </li>
            {/if}
          {/each}
        </ol>
      {/if}
      <p class="text-sm text-ink-muted">Najpierw kolejka, potem włączone tematy w kolejności mapy.</p>
    </section>

    <section class="card" aria-labelledby="plan-title">
      <h2 id="plan-title" class="card-title">Słówka</h2>
      <WordPlanEditor {plan} {states} onchange={savePlan} />
      <p aria-live="polite">
        {#if status === 'failed'}<span class="notice">Nie udało się zapisać zmiany. Odśwież stronę i spróbuj jeszcze raz.</span>
        {:else if status === 'saved'}<span class="sr-only">Zapisano.</span>{/if}
      </p>
    </section>

    {#if limits}
      <section class="card" aria-labelledby="limits-title">
        <h2 id="limits-title" class="card-title">Czas zabawy</h2>
        <div class="flex flex-wrap gap-4">
          <label class="grid gap-1">
            <span class="font-bold">Dziennie</span>
            <select class="select" data-testid="limit-daily" value={limits.dailyMinutes ?? ''} onchange={(e) => saveLimit('dailyMinutes', e.currentTarget.value)}>
              {#each choicesWith(DAILY_CHOICES, limits.dailyMinutes) as n (n)}
                <option value={n ?? ''}>{choiceLabel(n)}</option>
              {/each}
            </select>
          </label>
          <label class="grid gap-1">
            <span class="font-bold">Jedna sesja</span>
            <select class="select" data-testid="limit-session" value={limits.sessionMinutes ?? ''} onchange={(e) => saveLimit('sessionMinutes', e.currentTarget.value)}>
              {#each choicesWith(SESSION_CHOICES, limits.sessionMinutes) as n (n)}
                <option value={n ?? ''}>{choiceLabel(n)}</option>
              {/each}
            </select>
          </label>
        </div>
        <p class="text-sm text-ink-muted">
          Gdy czas minie, dziecko kończy bieżące ćwiczenie, a potem Polly idzie spać. Ekran dziecka odblokuje się po
          przejściu bramki dla rodzica albo następnego dnia. Minuty liczy każde urządzenie osobno i sumuje je przez
          synchronizację, więc bez internetu limit jest przybliżony.
        </p>
      </section>
    {/if}

    <section class="card" aria-labelledby="progress-title">
      <h2 id="progress-title" class="card-title">Postępy</h2>
      <ProgressDashboard {progress} {plan} {states} {today} />
    </section>

    <section class="card" aria-labelledby="profile-title">
      <h2 id="profile-title" class="card-title">Profil</h2>
      {#if editing}
        <ChildForm initial={profile} submitLabel="Zapisz" onsubmit={saveProfile} oncancel={() => (editing = false)} />
      {:else}
        <div class="flex items-center gap-3">
          <ContentImage id={profile.avatar} class="size-14 object-contain" />
          <div>
            <p class="text-lg font-bold">{profile.name}</p>
            {#if profile.birthYear}<p class="text-sm text-ink-muted">Rok urodzenia: {profile.birthYear}</p>{/if}
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="button" onclick={() => (editing = true)}>Zmień profil</button>
          {#if confirming}
            <span class="notice self-center">Na pewno? Postępy tego dziecka znikną z listy.</span>
            <button type="button" class="button-danger" onclick={remove} data-testid="delete-confirm">Tak, usuń</button>
            <button type="button" class="button-quiet" onclick={() => (confirming = false)}>Anuluj</button>
          {:else}
            <button type="button" class="button-quiet" onclick={() => (confirming = true)} data-testid="delete">Usuń dziecko</button>
          {/if}
        </div>
      {/if}
    </section>
  {/if}

  <p class="flex flex-wrap gap-4">
    <a class="link" href="#/parent">Panel rodzica</a>
    <a class="link" href="#/">Wróć do dziecka</a>
  </p>
</ParentLayout>
