<!--
  The lesson player (PLAN.md "A lesson", Phase 5 task 1): the steps of `composeLesson`, with
  their pictures planned once by `planLesson` (STATE.md decisions 41–42).

  - Look and listen: one big picture; Polly says „Popatrz i posłuchaj.” and the word, the
    picture pulses until the child taps it (that records it as introduced), then a big ▶.
  - Picks (E1): „Gdzie jest {word}?” and 2–4 pictures, with errorless feedback; each solved
    pick is recorded as an attempt at once (decision 44) and the next step follows by itself.
  - Finish: the island gets its flag, the stars appear (decision 45), and the lesson and its
    stars are written together. Then the child sails back to the map.

  Progress dots, 🐢/🐇, Polly's reactions, 🔊 on picks, and the long-press home throughout.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { replace } from 'svelte-spa-router';
  import ChildLayout from '../../lib/components/ChildLayout.svelte';
  import FinishScreen from '../../lib/components/FinishScreen.svelte';
  import HomeButton from '../../lib/components/HomeButton.svelte';
  import PickExercise from '../../lib/components/PickExercise.svelte';
  import PollyBuddy, { type Mood } from '../../lib/components/PollyBuddy.svelte';
  import RepeatButton from '../../lib/components/RepeatButton.svelte';
  import SpeakingPicture from '../../lib/components/SpeakingPicture.svelte';
  import SpeedToggle from '../../lib/components/SpeedToggle.svelte';
  import { prompt, topics, word, words } from '../../lib/content';
  import { loadFamily } from '../../lib/db';
  import { childPlan, liveChild } from '../../lib/domain/children';
  import { planLesson, starsFor, type PlayStep } from '../../lib/domain/exercise';
  import { wordStates } from '../../lib/domain/learning';
  import { introducedBy, lessonFor } from '../../lib/domain/lesson';
  import { addStars, recordAttempt, recordIntroduced, recordLesson } from '../../lib/domain/progress';
  import { localDay } from '../../lib/domain/time';
  import { sounds } from '../../lib/sound/effects';
  import { speaker, spokenForm, type Segment } from '../../lib/speech';
  import { speed } from '../../lib/speech/speed.svelte';
  import { change } from '../../lib/store';
  import { unlock } from '../../lib/unlock';
  import type { Screen } from '../../lib/screens';

  let { screen, params }: { screen: Screen; params?: Record<string, string> | null } = $props();

  /** The finish screen stays at least this long before sailing back. */
  const FINISH_MS = 2500;

  const childId = $derived(params?.id ?? '');
  const lessonId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  let steps = $state<PlayStep[]>([]);
  let index = $state(0);
  /** Look and listen: the picture has been tapped at least once. */
  let tapped = $state(false);
  let finished = $state(false);
  let stars = $state(0);
  let mood = $state<Mood>('idle');
  let beat = $state(0);
  let exercise = $state<{ ask: (lead?: Segment[]) => void } | undefined>();
  /** Per solved pick, in order: right on the first try. */
  const firstTries: boolean[] = [];

  const current = $derived(steps[index]);
  const currentWord = $derived(current ? word(current.word) : undefined);
  /** The opening line goes with the first step, whatever it is. */
  const opening = (): Segment[] => (index === 0 ? [{ lang: 'pl', text: prompt('lesson.start') }] : []);

  onMount(() => {
    void (async () => {
      const file = await loadFamily();
      if (!liveChild(file, childId)) return replace('/');
      const composed = lessonFor(file, childId, topics, localDay(new Date()));
      const context = { plan: childPlan(file, childId), states: wordStates(file.progress[childId]), words };
      steps = planLesson(composed, context, lessonId).filter((s) => word(s.word));
      if (steps.length === 0) return replace(`/child/${childId}`);
      present();
    })();
  });

  function react(next: Mood) {
    mood = next;
    beat += 1;
  }

  /** Look and listen speaks here; a pick asks its own question when it appears. */
  function present() {
    const w = currentWord;
    if (current?.kind !== 'introduce' || !w) return;
    const first = introducedBy(steps)[0] === w.id;
    const lead: Segment[] = [...opening(), { lang: 'pl', text: prompt(first ? 'intro.look' : 'intro.next') }];
    void speaker().saySegments([...lead, { lang: 'en', text: spokenForm(w) }], speed.value);
  }

  function onIntroTap() {
    const w = currentWord;
    if (!w || tapped) return;
    tapped = true;
    react('happy');
    const at = new Date().toISOString();
    void change((file, _now, device) => recordIntroduced(file, childId, device, w.id, at));
  }

  function onSolved(misses: number) {
    const w = currentWord;
    if (!w) return;
    firstTries.push(misses === 0);
    const day = localDay(new Date());
    void change((file, _now, device) => recordAttempt(file, childId, device, w.id, day, misses));
    void advance();
  }

  function next() {
    unlock();
    sounds().play('tap');
    void advance();
  }

  async function advance() {
    if (index < steps.length - 1) {
      index += 1;
      tapped = false;
      react('idle');
      present();
      return;
    }
    await finish();
  }

  async function finish() {
    finished = true;
    stars = starsFor(steps.length, firstTries);
    const record = { at: startedAt, words: introducedBy(steps) };
    const earned = stars;
    const saved = change((file, _now, device) =>
      addStars(recordLesson(file, childId, device, lessonId, record), childId, device, earned)
    );
    sounds().play('sparkle');
    const minimum = new Promise((r) => setTimeout(r, FINISH_MS));
    await Promise.all([saved, minimum, speaker().sayPrompt(prompt('lesson.finish'), speed.value)]);
    await replace(`/child/${childId}`);
  }
</script>

<ChildLayout>
  <h1 class="sr-only">{screen.title}</h1>
  {#if finished}
    <div class="flex flex-1 flex-col" data-testid="lesson-finished">
      <FinishScreen {stars} flag />
    </div>
  {:else if current && currentWord}
    <header class="flex items-center justify-between gap-3 p-3">
      <HomeButton onexit={() => replace(`/child/${childId}`)} />
      <ol class="flex flex-wrap justify-center gap-2" aria-label="Postęp" data-testid="dots">
        {#each steps as step, i (i)}
          <li class="lesson-dot" class:is-done={i < index || (i === index && step.kind === 'introduce' && tapped)} class:is-now={i === index}></li>
        {/each}
      </ol>
      <SpeedToggle />
    </header>

    <div class="flex flex-1 flex-col items-center justify-center gap-6 p-4" data-testid="step" data-kind={current.kind} data-index={index}>
      {#key index}
        {#if current.kind === 'introduce'}
          <div class="lesson-picture" class:is-cued={!tapped} data-testid="lesson-word" data-word={currentWord.id}>
            <SpeakingPicture word={currentWord} class="lesson-picture-button" ontap={onIntroTap} />
          </div>
          <div class="grid h-28 place-items-center">
            {#if tapped}
              <button type="button" class="next-button" aria-label="Dalej" data-testid="next" onclick={next}>
                <svg viewBox="0 0 48 48" class="pointer-events-none h-full w-full" aria-hidden="true" focusable="false">
                  <path d="M18 12 L 36 24 L 18 36 Z" class="fill-white" />
                </svg>
              </button>
            {/if}
          </div>
        {:else}
          <PickExercise
            bind:this={exercise}
            target={current.word}
            choices={current.choices}
            lead={opening()}
            onsolved={onSolved}
            onmood={react}
          />
        {/if}
      {/key}
    </div>

    <footer class="flex items-end justify-between p-3">
      <PollyBuddy {mood} {beat} class="size-20" />
      {#if current.kind === 'pick'}
        <RepeatButton onrepeat={() => exercise?.ask()} />
      {/if}
    </footer>
  {/if}
</ChildLayout>
