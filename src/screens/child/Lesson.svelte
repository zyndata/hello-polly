<!--
  The lesson, Phase 4 edition (PLAN.md Phase 4 task 5; STATE.md decision 39): look and listen
  only. Each new word of the next lesson (≤ 3, from `composeLesson`) is one big picture: Polly
  says „Popatrz i posłuchaj.” and the word, the picture pulses until the child taps it, and the
  tap says the word again and records it as introduced. A big ▶ then moves on. After the last
  word the island is won: the lesson is recorded and the child sails back to the map.
  The picks (E1–E3) join in Phase 5.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { replace } from 'svelte-spa-router';
  import ChildLayout from '../../lib/components/ChildLayout.svelte';
  import ContentImage from '../../lib/components/ContentImage.svelte';
  import HomeButton from '../../lib/components/HomeButton.svelte';
  import Island from '../../lib/components/Island.svelte';
  import SpeakingPicture from '../../lib/components/SpeakingPicture.svelte';
  import SpeedToggle from '../../lib/components/SpeedToggle.svelte';
  import { prompt, topics, word } from '../../lib/content';
  import { loadFamily } from '../../lib/db';
  import { liveChild } from '../../lib/domain/children';
  import { introducedBy, lessonFor } from '../../lib/domain/lesson';
  import { recordIntroduced, recordLesson } from '../../lib/domain/progress';
  import { localDay } from '../../lib/domain/time';
  import { sounds } from '../../lib/sound/effects';
  import { speaker, spokenForm, type Segment } from '../../lib/speech';
  import { speed } from '../../lib/speech/speed.svelte';
  import { change } from '../../lib/store';
  import { unlock } from '../../lib/unlock';
  import type { Screen } from '../../lib/screens';
  import type { Word } from '../../lib/types';

  let { screen, params }: { screen: Screen; params?: Record<string, string> | null } = $props();

  /** The finish screen stays at least this long before sailing back. */
  const FINISH_MS = 1500;

  const childId = $derived(params?.id ?? '');
  const lessonId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  let words = $state<Word[]>([]);
  let index = $state(0);
  /** The current picture has been tapped at least once. */
  let tapped = $state(false);
  let finished = $state(false);

  const current = $derived(words[index]);

  onMount(() => {
    void (async () => {
      const file = await loadFamily();
      if (!liveChild(file, childId)) return replace('/');
      const ids = introducedBy(lessonFor(file, childId, topics, localDay(new Date())));
      words = ids.flatMap((id) => (word(id) ? [word(id) as Word] : []));
      if (words.length === 0) return replace(`/child/${childId}`);
      present();
    })();
  });

  function present() {
    const w = words[index];
    if (!w) return;
    const lead: Segment[] =
      index === 0
        ? [
            { lang: 'pl', text: prompt('lesson.start') },
            { lang: 'pl', text: prompt('intro.look') }
          ]
        : [{ lang: 'pl', text: prompt('intro.next') }];
    void speaker().saySegments([...lead, { lang: 'en', text: spokenForm(w) }], speed.value);
  }

  function onTap() {
    const w = current;
    if (!w || tapped) return;
    tapped = true;
    const at = new Date().toISOString();
    void change((file, _now, device) => recordIntroduced(file, childId, device, w.id, at));
  }

  async function next() {
    unlock();
    sounds().play('tap');
    if (index < words.length - 1) {
      index += 1;
      tapped = false;
      present();
      return;
    }
    await finish();
  }

  async function finish() {
    finished = true;
    const record = { at: startedAt, words: words.map((w) => w.id) };
    const saved = change((file, _now, device) => recordLesson(file, childId, device, lessonId, record));
    sounds().play('sparkle');
    const minimum = new Promise((r) => setTimeout(r, FINISH_MS));
    await Promise.all([saved, minimum, speaker().sayPrompt(prompt('lesson.finish'), speed.value)]);
    await replace(`/child/${childId}`);
  }
</script>

<ChildLayout>
  <h1 class="sr-only">{screen.title}</h1>
  {#if finished}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 p-6" data-testid="lesson-finished">
      <span class="finish-island">
        <Island flag class="h-full w-full" />
      </span>
      <ContentImage id="parrot" class="finish-polly pointer-events-none size-32 object-contain drop-shadow-xl" />
    </div>
  {:else if current}
    <header class="flex items-center justify-between gap-3 p-3">
      <HomeButton onexit={() => replace(`/child/${childId}`)} />
      <ol class="flex gap-2" aria-label="Postęp">
        {#each words as w, i (w.id)}
          <li class="lesson-dot" class:is-done={i < index || (i === index && tapped)} class:is-now={i === index}></li>
        {/each}
      </ol>
      <SpeedToggle />
    </header>

    <div class="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      {#key current.id}
        <div class="lesson-picture" class:is-cued={!tapped} data-testid="lesson-word" data-word={current.id}>
          <SpeakingPicture word={current} class="lesson-picture-button" ontap={onTap} />
        </div>
      {/key}
      <div class="grid h-28 place-items-center">
        {#if tapped}
          <button type="button" class="next-button" aria-label="Dalej" data-testid="next" onclick={next}>
            <svg viewBox="0 0 48 48" class="pointer-events-none h-full w-full" aria-hidden="true" focusable="false">
              <path d="M18 12 L 36 24 L 18 36 Z" class="fill-white" />
            </svg>
          </button>
        {/if}
      </div>
    </div>
  {/if}
</ChildLayout>
