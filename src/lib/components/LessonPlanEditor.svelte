<!--
  The parent's lesson plan (STATE.md decision 105): lessons planned ahead, in order, each one
  island with up to four words of the parent's choice. A planned lesson teaches its new words
  (look and listen, then picks) and practises the ones the child has met. Once a device finishes
  one, it leaves the list; with none left, lessons are composed from the queue and the topics
  again. The editor only reports the new plan; the screen stores it.
-->
<script lang="ts">
  import ContentImage from './ContentImage.svelte';
  import SpeakingPicture from './SpeakingPicture.svelte';
  import { topics, word } from '../content';
  import type { WordState } from '../domain/learning';
  import {
    MAX_PLANNED_WORDS,
    STATUS_LABELS,
    addLesson,
    moveLesson,
    pendingLessons,
    planWordStatus,
    removeLesson,
    setLessonWords
  } from '../domain/plan';
  import type { WordId, WordPlan } from '../types';

  interface Props {
    plan: WordPlan;
    states?: ReadonlyMap<WordId, WordState>;
    /** Ids of the planned lessons a device has finished. */
    finished?: ReadonlySet<string>;
    onchange: (plan: WordPlan) => void;
  }

  let { plan, states = new Map(), finished = new Set(), onchange }: Props = $props();

  const exists = new Set(topics.flatMap((t) => t.words));
  const pending = $derived(pendingLessons(plan, finished, exists));

  /** The lesson being built or changed: its id (`undefined` for a new one) and its words. */
  let draft = $state<{ id?: string; words: WordId[] } | undefined>();
  const full = $derived((draft?.words.length ?? 0) >= MAX_PLANNED_WORDS);

  const label = (i: number) => (i === 0 ? 'Następna wyspa' : `Wyspa ${i + 1}.`);

  function toggle(id: WordId) {
    if (!draft) return;
    if (draft.words.includes(id)) draft.words = draft.words.filter((w) => w !== id);
    else if (!full) draft.words = [...draft.words, id];
  }

  function save() {
    if (!draft || draft.words.length === 0) return;
    const words = [...draft.words];
    onchange(draft.id ? setLessonWords(plan, draft.id, words) : addLesson(plan, crypto.randomUUID(), words));
    draft = undefined;
  }
</script>

<div class="grid gap-3" data-testid="lesson-plan">
  <p class="text-sm text-ink-muted">
    Każda zaplanowana lekcja to jedna wyspa na mapie dziecka, w tej kolejności. Wybierz do {MAX_PLANNED_WORDS} słówek:
    nowe dziecko pozna, a te, które już zna, poćwiczy. Gdy zaplanowane lekcje się skończą, lekcje znów układają się same
    z kolejki i włączonych tematów.
  </p>

  {#if pending.length === 0}
    <p class="text-ink-muted" data-testid="no-planned">Brak zaplanowanych lekcji.</p>
  {:else}
    <ol class="grid gap-2" data-testid="planned-lessons">
      {#each pending as lesson, i (lesson.id)}
        <li class="grid gap-2 rounded-xl bg-foam p-2" data-planned-lesson={lesson.id}>
          <div class="flex items-center gap-2">
            <span class="flex-1 font-bold">{label(i)}</span>
            <button type="button" class="icon-button" aria-label="Wcześniej: {label(i)}" disabled={i === 0} onclick={() => onchange(moveLesson(plan, lesson.id, -1))}
              >↑</button
            >
            <button
              type="button"
              class="icon-button"
              aria-label="Później: {label(i)}"
              disabled={i === pending.length - 1}
              onclick={() => onchange(moveLesson(plan, lesson.id, 1))}>↓</button
            >
            <button type="button" class="icon-button" aria-label="Usuń: {label(i)}" onclick={() => onchange(removeLesson(plan, lesson.id))}>✕</button>
          </div>
          <ul class="flex flex-wrap gap-2">
            {#each lesson.words as id (id)}
              {@const w = word(id)}
              {#if w}
                <li class="grid justify-items-center rounded-xl bg-white p-2 text-sm" data-word={id}>
                  <ContentImage id={w.image} class="size-10 object-contain" />
                  <strong>{w.en}</strong>
                  <span class="text-ink-muted">{STATUS_LABELS[planWordStatus(plan, states, id)]}</span>
                </li>
              {/if}
            {/each}
          </ul>
          {#if !draft}
            <button type="button" class="button-quiet justify-self-start" onclick={() => (draft = { id: lesson.id, words: [...lesson.words] })}>
              Zmień słówka
            </button>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}

  {#if draft}
    <div class="grid gap-3 rounded-xl border-2 border-ocean bg-white p-3" data-testid="lesson-draft">
      <h4 class="font-extrabold text-deep-sea">
        {draft.id ? 'Zmień słówka lekcji' : 'Nowa lekcja'}: wybrane {draft.words.length} z {MAX_PLANNED_WORDS}
      </h4>
      {#if draft.words.length > 0}
        <ul class="flex flex-wrap gap-2" data-testid="draft-words">
          {#each draft.words as id (id)}
            {@const w = word(id)}
            {#if w}
              <li>
                <button type="button" class="chip is-on" aria-label="Usuń z lekcji: {w.pl}" onclick={() => toggle(id)}>{w.en} ✕</button>
              </li>
            {/if}
          {/each}
        </ul>
      {:else}
        <p class="text-sm text-ink-muted">Dotknij słówek poniżej, żeby dodać je do lekcji.</p>
      {/if}

      {#each topics as t (t.id)}
        <details class="rounded-xl border border-sky/60" data-draft-topic={t.id}>
          <summary class="flex cursor-pointer items-center gap-3 p-2">
            <ContentImage id={t.icon} class="size-8 object-contain" />
            <span class="flex-1 font-bold">{t.pl}</span>
          </summary>
          <ul class="grid grid-cols-2 gap-2 border-t border-sky/40 p-2 sm:grid-cols-3">
            {#each t.words as id (id)}
              {@const w = word(id)}
              {#if w}
                {@const on = draft.words.includes(id)}
                <li class="grid grid-cols-[auto_1fr] items-center gap-1">
                  <SpeakingPicture word={w} class="size-12" />
                  <button
                    type="button"
                    class="plan-pick"
                    class:is-on={on}
                    aria-pressed={on}
                    disabled={!on && full}
                    data-pick-word={id}
                    onclick={() => toggle(id)}
                  >
                    <strong>{w.en}</strong>
                    <span class="block text-xs">{w.pl} · {STATUS_LABELS[planWordStatus(plan, states, id)]}</span>
                  </button>
                </li>
              {/if}
            {/each}
          </ul>
        </details>
      {/each}

      <div class="flex flex-wrap gap-2">
        <button type="button" class="button" disabled={draft.words.length === 0} data-testid="lesson-save" onclick={save}>Zapisz lekcję</button>
        <button type="button" class="button-quiet" onclick={() => (draft = undefined)}>Anuluj</button>
      </div>
    </div>
  {:else}
    <button type="button" class="button justify-self-start" data-testid="lesson-add" onclick={() => (draft = { words: [] })}>Zaplanuj lekcję</button>
  {/if}
</div>
