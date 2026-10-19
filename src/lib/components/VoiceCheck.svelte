<!--
  The voice check (PLAN.md "First run" step 2 and Phase 3 task 3): names the English and the
  Polish voice this device will use, says what to install when one is missing, and plays a test
  word at both speeds and a Polish greeting. Used by /setup and /parent/speech.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { prompt, word } from '../content';
  import { speaker, type EngineVoice } from '../speech';
  import { chooseVoice, normaliseLang } from '../speech/voices';
  import { unlock } from '../unlock';
  import type { Accent, Speed, Word } from '../types';

  interface Props {
    accent: Accent;
    /** Language tag → preferred voice id on this device. */
    preferred?: Partial<Record<string, string>>;
  }

  let { accent, preferred = {} }: Props = $props();

  /** How long an empty voice list counts as "still loading". */
  const SEARCH_MS = 3000;
  const POLISH = 'pl-PL';
  const TEST_WORD = word('fruit.banana') as Word;

  const voice = speaker();
  const available = voice.engine.isAvailable();

  let voices = $state<readonly EngineVoice[]>(voice.engine.voices());
  let searching = $state(true);

  const english = $derived(chooseVoice(voices, accent, preferred[accent]));
  const polish = $derived(chooseVoice(voices, POLISH, preferred[POLISH]));
  const adjective = $derived(accent === 'en-GB' ? 'brytyjski' : 'amerykański');
  const where = (v: EngineVoice) => (v.local ? 'na urządzeniu' : 'z internetu');

  onMount(() => {
    const stop = voice.engine.onVoicesChanged(() => (voices = voice.engine.voices()));
    const timer = setTimeout(() => (searching = false), SEARCH_MS);
    voices = voice.engine.voices();
    return () => {
      stop();
      clearTimeout(timer);
    };
  });

  function playEnglish(at: Speed) {
    unlock();
    void voice.sayWord(TEST_WORD, at);
  }

  function playPolish() {
    unlock();
    void voice.speak(prompt('start.hello'), { lang: 'pl', speed: 'normal' });
  }
</script>

{#if !available}
  <p class="notice" data-testid="no-speech">
    Ta przeglądarka nie potrafi mówić. Otwórz Hello Polly w Chrome na Androidzie albo w Safari na iPhonie lub
    iPadzie.
  </p>
{:else if voices.length === 0 && searching}
  <p class="text-ink-muted">Szukam głosów na tym urządzeniu…</p>
{:else}
  <dl class="grid gap-3">
    <div data-testid="voice-en">
      <dt class="font-bold">Angielski ({adjective})</dt>
      <dd>
        {#if english && normaliseLang(english.lang) === accent}
          <strong>{english.name}</strong> <span class="text-ink-muted">({english.lang}, {where(english)})</span>
        {:else if english}
          Nie ma głosu w akcencie {adjective === 'brytyjski' ? 'brytyjskim' : 'amerykańskim'}, więc mówi
          <strong>{english.name}</strong> <span class="text-ink-muted">({english.lang}, {where(english)})</span>.
        {:else}
          <span class="notice">Na tym urządzeniu nie ma angielskiego głosu. Bez niego słówek nie będzie słychać.</span>
        {/if}
      </dd>
    </div>
    <div data-testid="voice-pl">
      <dt class="font-bold">Polski (polecenia)</dt>
      <dd>
        {#if polish}
          <strong>{polish.name}</strong> <span class="text-ink-muted">({polish.lang}, {where(polish)})</span>
        {:else}
          <span class="notice">
            Na tym urządzeniu nie ma polskiego głosu. Polecenia dla dziecka będą wtedy tylko obrazkami i animacją, a
            angielskie słówka nadal będzie słychać.
          </span>
        {/if}
      </dd>
    </div>
  </dl>
  {#if !english || !polish}
    <div class="text-sm text-ink-muted" data-testid="install-help">
      <p class="font-bold">Jak dodać głos:</p>
      <ul class="list-disc pl-5">
        <li>
          Android: Ustawienia → System → Języki → Zamiana tekstu na mowę → Usługi mowy Google → Zainstaluj dane
          głosowe (angielski i polski).
        </li>
        <li>iPhone i iPad: Ustawienia → Dostępność → Treść mówiona → Głosy → Angielski / Polski.</li>
      </ul>
      <p>Po instalacji odśwież tę stronę.</p>
    </div>
  {/if}
{/if}

{#if available}
  <div class="flex flex-wrap gap-2">
    <button type="button" class="button" onclick={() => playEnglish('slow')}>🐢 „{TEST_WORD.en}” wolno</button>
    <button type="button" class="button" onclick={() => playEnglish('normal')}>🐇 „{TEST_WORD.en}” normalnie</button>
    <button type="button" class="button" onclick={playPolish}>Polski: „{prompt('start.hello')}”</button>
  </div>
{/if}
