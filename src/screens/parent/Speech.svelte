<!--
  /parent/speech (PLAN.md Phase 3, task 3): the voice check, the accent, the rates, the slow
  repeat, the default speed, Polish prompts, the voice per language on this device, a board of
  every word to listen to (the tool for the speech quality gate), and the sound effects.
  Settings are family-wide `Lww` registers; the chosen voices belong to this device only.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import ParentLayout from '../../lib/components/ParentLayout.svelte';
  import SpeakingPicture from '../../lib/components/SpeakingPicture.svelte';
  import SpeedToggle from '../../lib/components/SpeedToggle.svelte';
  import VoiceCheck from '../../lib/components/VoiceCheck.svelte';
  import { topics, word } from '../../lib/content';
  import { getPreferredVoices, loadFamily, setPreferredVoice, type PreferredVoiceIds } from '../../lib/db';
  import { change } from '../../lib/store';
  import { DEFAULT_SETTINGS, RATE_RANGES, readSettings, setSetting } from '../../lib/domain/family';
  import { EFFECT_NAMES, sounds, type Effect } from '../../lib/sound/effects';
  import { speaker, type EngineVoice } from '../../lib/speech';
  import { speed } from '../../lib/speech/speed.svelte';
  import { baseLang } from '../../lib/speech/voices';
  import { unlock } from '../../lib/unlock';
  import type { Screen } from '../../lib/screens';
  import type { Accent, FamilySettings } from '../../lib/types';

  let { screen }: { screen: Screen; params?: Record<string, string> | null } = $props();

  const POLISH = 'pl-PL';

  const ACCENTS: { value: Accent; label: string; adjective: string }[] = [
    { value: 'en-GB', label: 'Brytyjski (en-GB)', adjective: 'brytyjski' },
    { value: 'en-US', label: 'Amerykański (en-US)', adjective: 'amerykański' }
  ];
  const EFFECT_LABELS: Record<Effect, string> = {
    tap: 'Dotknięcie',
    correct: 'Dobra odpowiedź',
    sparkle: 'Iskierki',
    wiggle: 'Spróbuj jeszcze raz',
    'chest-creak': 'Skrzynia się otwiera',
    pop: 'Pęknięcie bańki'
  };

  const voice = speaker();
  const available = voice.engine.isAvailable();

  let settings = $state<FamilySettings>({ ...DEFAULT_SETTINGS });
  let preferred = $state<PreferredVoiceIds>({});
  let voices = $state<readonly EngineVoice[]>(voice.engine.voices());

  const accentName = $derived(ACCENTS.find((a) => a.value === settings.accent)?.adjective ?? '');
  const englishVoices = $derived(sortVoices(voices.filter((v) => baseLang(v.lang) === 'en')));
  const polishVoices = $derived(sortVoices(voices.filter((v) => baseLang(v.lang) === 'pl')));

  function sortVoices(list: readonly EngineVoice[]): EngineVoice[] {
    return [...list].sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  }

  const where = (v: EngineVoice) => (v.local ? 'na urządzeniu' : 'z internetu');

  onMount(() => {
    const stop = voice.engine.onVoicesChanged(() => (voices = voice.engine.voices()));
    void (async () => {
      const [family, ids] = await Promise.all([loadFamily(), getPreferredVoices()]);
      settings = readSettings(family);
      preferred = ids;
      voices = voice.engine.voices();
    })();
    return stop;
  });

  async function save<K extends keyof FamilySettings>(key: K, value: FamilySettings[K]) {
    const file = await change((f, now, device) => setSetting(f, key, value, now, device));
    settings = readSettings(file);
    voice.configure(settings, preferred);
    if (key === 'defaultSpeed') speed.setDefault(settings.defaultSpeed);
  }

  async function choose(tag: string, id: string) {
    preferred = await setPreferredVoice(tag, id === '' ? null : id);
    voice.configure(settings, preferred);
  }

  function playEffect(effect: Effect) {
    unlock();
    sounds().play(effect);
  }

  const rate = (value: number) => value.toFixed(2).replace('.', ',');
  const numberFrom = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);
</script>

<ParentLayout title={screen.title}>
  <section class="card" aria-labelledby="check">
    <h2 id="check" class="card-title">Sprawdzenie głosu</h2>
    <VoiceCheck accent={settings.accent} {preferred} />
  </section>

  <section class="card" aria-labelledby="accent">
    <h2 id="accent" class="card-title">Akcent angielski</h2>
    <p class="text-sm text-ink-muted">Wspólny dla całej rodziny.</p>
    {#each ACCENTS as accent (accent.value)}
      <label class="choice">
        <input
          type="radio"
          name="accent"
          value={accent.value}
          checked={settings.accent === accent.value}
          onchange={() => save('accent', accent.value)}
        />
        {accent.label}
      </label>
    {/each}
  </section>

  <section class="card" aria-labelledby="tempo">
    <h2 id="tempo" class="card-title">Tempo</h2>
    <label class="grid gap-1">
      <span>🐢 Wolno: <strong data-testid="slow-rate">{rate(settings.slowRate)}</strong></span>
      <input
        type="range"
        min={RATE_RANGES.slowRate[0]}
        max={RATE_RANGES.slowRate[1]}
        step="0.05"
        value={settings.slowRate}
        oninput={(e) => (settings.slowRate = numberFrom(e))}
        onchange={(e) => save('slowRate', numberFrom(e))}
        data-testid="slow-rate-input"
      />
    </label>
    <label class="grid gap-1">
      <span>🐇 Normalnie: <strong data-testid="normal-rate">{rate(settings.normalRate)}</strong></span>
      <input
        type="range"
        min={RATE_RANGES.normalRate[0]}
        max={RATE_RANGES.normalRate[1]}
        step="0.05"
        value={settings.normalRate}
        oninput={(e) => (settings.normalRate = numberFrom(e))}
        onchange={(e) => save('normalRate', numberFrom(e))}
        data-testid="normal-rate-input"
      />
    </label>
    <label class="choice">
      <input
        type="checkbox"
        checked={settings.slowRepeatTwice}
        onchange={(e) => save('slowRepeatTwice', (e.currentTarget as HTMLInputElement).checked)}
      />
      Powtarzaj wolno dwa razy
    </label>
    <fieldset class="grid gap-1">
      <legend class="mb-1">Tempo na start:</legend>
      <label class="choice">
        <input
          type="radio"
          name="default-speed"
          checked={settings.defaultSpeed === 'slow'}
          onchange={() => save('defaultSpeed', 'slow')}
        />
        🐢 wolno
      </label>
      <label class="choice">
        <input
          type="radio"
          name="default-speed"
          checked={settings.defaultSpeed === 'normal'}
          onchange={() => save('defaultSpeed', 'normal')}
        />
        🐇 normalnie
      </label>
    </fieldset>
    <label class="choice">
      <input
        type="checkbox"
        checked={settings.polishPrompts}
        onchange={(e) => save('polishPrompts', (e.currentTarget as HTMLInputElement).checked)}
      />
      Polskie polecenia głosem
    </label>
  </section>

  {#if available && voices.length > 0}
    <section class="card" aria-labelledby="voices">
      <h2 id="voices" class="card-title">Głosy na tym urządzeniu</h2>
      <p class="text-sm text-ink-muted">Wybór głosu dotyczy tylko tego urządzenia: na innych telefonach są inne głosy.</p>
      <label class="grid gap-1">
        <span>Głos angielski ({accentName})</span>
        <select
          class="select"
          value={preferred[settings.accent] ?? ''}
          onchange={(e) => choose(settings.accent, (e.currentTarget as HTMLSelectElement).value)}
          data-testid="voice-en-select"
        >
          <option value="">Automatycznie</option>
          {#each englishVoices as v (v.id)}
            <option value={v.id}>{v.name} ({v.lang}, {where(v)})</option>
          {/each}
        </select>
      </label>
      <label class="grid gap-1">
        <span>Głos polski</span>
        <select
          class="select"
          value={preferred[POLISH] ?? ''}
          onchange={(e) => choose(POLISH, (e.currentTarget as HTMLSelectElement).value)}
        >
          <option value="">Automatycznie</option>
          {#each polishVoices as v (v.id)}
            <option value={v.id}>{v.name} ({v.lang}, {where(v)})</option>
          {/each}
        </select>
      </label>
      <details>
        <summary class="cursor-pointer font-bold">Wszystkie głosy ({voices.length})</summary>
        <ul class="mt-2 grid gap-1 text-sm" data-testid="all-voices">
          {#each sortVoices(voices) as v (v.id)}
            <li>
              <strong>{v.name}</strong>
              <span class="text-ink-muted">· {v.lang} · {where(v)}{v.isDefault ? ' · domyślny' : ''}</span>
            </li>
          {/each}
        </ul>
      </details>
    </section>
  {/if}

  <section class="card" aria-labelledby="words">
    <h2 id="words" class="card-title">Posłuchaj słówek</h2>
    <p class="text-sm text-ink-muted">
      Tak samo jak dziecko: dotknij obrazka, a żółw albo zając zmienia tempo. Sprawdź, czy wolne tempo jest
      wyraźne dla kogoś, kto słyszy słowo pierwszy raz.
    </p>
    <SpeedToggle />
    {#each topics as t (t.id)}
      <h3 class="mt-2 font-bold">{t.pl}</h3>
      <ul class="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {#each t.words as id (id)}
          {@const w = word(id)}
          {#if w}
            <li class="grid justify-items-center gap-1 text-center">
              <SpeakingPicture word={w} class="size-24" />
              <span class="text-sm leading-tight"><strong>{w.en}</strong><br /><span class="text-ink-muted">{w.pl}</span></span>
            </li>
          {/if}
        {/each}
      </ul>
    {/each}
  </section>

  <section class="card" aria-labelledby="effects">
    <h2 id="effects" class="card-title">Dźwięki</h2>
    <p class="text-sm text-ink-muted">Tworzone na bieżąco przez przeglądarkę; aplikacja nie ma żadnych plików audio.</p>
    <div class="flex flex-wrap gap-2">
      {#each EFFECT_NAMES as effect (effect)}
        <button type="button" class="button" data-effect={effect} onclick={() => playEffect(effect)}>
          {EFFECT_LABELS[effect]}
        </button>
      {/each}
    </div>
  </section>

  <p class="flex flex-wrap gap-4">
    <a class="link" href="#/parent">Panel rodzica</a>
    <a class="link" href="#/">Wróć do dziecka</a>
  </p>
</ParentLayout>
