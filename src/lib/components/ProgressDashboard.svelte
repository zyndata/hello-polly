<!--
  The progress dashboard on /parent/child/:id (PLAN.md Phase 10 task 3; STATE.md decision 96):
  learned words per topic, the words that need practice, a 4-week activity calendar with the
  minutes of each day, stickers collected and stories heard. Everything over every device.
-->
<script lang="ts">
  import ContentImage from './ContentImage.svelte';
  import { stickers, stories, topic, topics, word } from '../content';
  import {
    activityCalendar,
    learnedPerTopic,
    needsPractice,
    recentMinutes,
    stickersCollected,
    storiesHeard
  } from '../domain/dashboard';
  import type { WordState } from '../domain/learning';
  import type { Day, DeviceId, DeviceProgress, WordId, WordPlan } from '../types';

  interface Props {
    progress: Record<DeviceId, DeviceProgress> | undefined;
    plan: WordPlan;
    states: ReadonlyMap<WordId, WordState>;
    today: Day;
  }

  let { progress, plan, states, today }: Props = $props();

  const WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

  const perTopic = $derived(learnedPerTopic(states, plan, topics));
  const practice = $derived(needsPractice(progress, (id) => word(id) !== undefined));
  const calendar = $derived(activityCalendar(progress, today));
  const minutesToday = $derived(recentMinutes(progress, today, 1));
  const minutesWeek = $derived(recentMinutes(progress, today, 7));
  const collected = $derived(stickersCollected(progress, stickers));
  const heard = $derived(storiesHeard(progress, stories));

  const dayLabel = (day: Day) =>
    new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))).toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'long'
    });
  const dayOfMonth = (day: Day) => Number(day.slice(8, 10));
  const times = (n: number) => (n === 1 ? 'raz' : `${n} razy`);
</script>

<div class="grid gap-5" data-testid="dashboard">
  <section class="grid gap-2" aria-labelledby="learned-title">
    <h3 id="learned-title" class="font-extrabold text-deep-sea">Nauczone słówka</h3>
    <ul class="grid gap-2" data-testid="learned-per-topic">
      {#each perTopic as t (t.topic.id)}
        <li class="grid gap-1" data-topic-progress={t.topic.id} data-learned={t.learned} data-total={t.total}>
          <span class="flex items-center gap-2">
            <ContentImage id={t.topic.icon} class="size-7 object-contain" />
            <span class="flex-1 font-bold">{t.topic.pl}</span>
            <span class="text-sm">{t.learned} z {t.total}</span>
          </span>
          <svg viewBox="0 0 100 6" class="h-2 w-full" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <rect width="100" height="6" rx="3" class="fill-foam" />
            <rect width={(100 * t.met) / t.total} height="6" rx="3" class="fill-sky" />
            <rect width={(100 * t.learned) / t.total} height="6" rx="3" class="fill-leaf" />
          </svg>
        </li>
      {/each}
    </ul>
    <p class="text-sm text-ink-muted">Zielone: nauczone. Jasnoniebieskie: poznane, jeszcze ćwiczone.</p>
  </section>

  <section class="grid gap-2" aria-labelledby="practice-title">
    <h3 id="practice-title" class="font-extrabold text-deep-sea">Do poćwiczenia</h3>
    {#if practice.length === 0}
      <p class="text-sm text-ink-muted">Na razie nic: każde słówko udało się za pierwszym razem.</p>
    {:else}
      <ol class="flex flex-wrap gap-2" data-testid="needs-practice">
        {#each practice as p (p.word)}
          {@const w = word(p.word)}
          {#if w}
            <li class="grid justify-items-center rounded-xl bg-foam p-2 text-sm" data-word={p.word} data-misses={p.misses}>
              <ContentImage id={w.image} class="size-10 object-contain" />
              <strong>{w.en}</strong>
              <span class="text-ink-muted">nie za 1. razem: {p.misses}</span>
            </li>
          {/if}
        {/each}
      </ol>
      <p class="text-sm text-ink-muted">Słówka, przy których dziecko najczęściej nie trafiło za pierwszym razem.</p>
    {/if}
  </section>

  <section class="grid gap-2" aria-labelledby="calendar-title">
    <h3 id="calendar-title" class="font-extrabold text-deep-sea">Ostatnie 4 tygodnie</h3>
    <p>
      Dziś: <strong data-testid="minutes-today">{minutesToday} min</strong> · ostatnie 7 dni:
      <strong data-testid="minutes-week">{minutesWeek} min</strong>
    </p>
    <div class="calendar" role="table" aria-label="Kalendarz aktywności" data-testid="calendar">
      <div class="contents" role="row">
        {#each WEEKDAYS as d (d)}
          <span class="calendar-head" role="columnheader">{d}</span>
        {/each}
      </div>
      {#each calendar as week, w (w)}
        <div class="contents" role="row">
          {#each week as cell (cell.day)}
            <span
              class="calendar-day level-{cell.level}"
              class:is-today={cell.day === today}
              class:is-future={cell.future}
              role="cell"
              aria-label={cell.future ? '' : `${dayLabel(cell.day)}: ${cell.active ? `${cell.minutes} min` : 'bez zabawy'}`}
              data-day={cell.day}
              data-minutes={cell.minutes}
            >
              {#if !cell.future}
                <span class="calendar-date">{dayOfMonth(cell.day)}</span>
                {#if cell.active}<span class="calendar-minutes">{cell.minutes > 0 ? `${cell.minutes}′` : '•'}</span>{/if}
              {/if}
            </span>
          {/each}
        </div>
      {/each}
    </div>
    <p class="text-sm text-ink-muted">Minuty zabawy dziennie, ze wszystkich urządzeń. Kropka: mniej niż minuta.</p>
  </section>

  <section class="grid gap-2" aria-labelledby="stickers-title">
    <h3 id="stickers-title" class="font-extrabold text-deep-sea">Naklejki</h3>
    <p data-testid="stickers-collected" data-owned={collected.owned}>
      Zebrane: <strong>{collected.owned} z {collected.total}</strong>
    </p>
    <ul class="flex flex-wrap gap-2 text-sm">
      {#each collected.sets as s (s.set)}
        <li class="rounded-xl bg-foam px-3 py-1">{topic(s.set)?.pl ?? s.set}: {s.owned} z {s.total}</li>
      {/each}
    </ul>
  </section>

  <section class="grid gap-2" aria-labelledby="stories-title">
    <h3 id="stories-title" class="font-extrabold text-deep-sea">Bajki</h3>
    <ul class="grid gap-1" data-testid="stories-heard">
      {#each heard as h (h.story)}
        {@const story = stories.find((s) => s.id === h.story)}
        <li class="flex justify-between gap-2" data-story={h.story} data-times={h.times}>
          <span>{story?.titlePl ?? h.story}</span>
          <span class="text-ink-muted">{h.times === 0 ? 'jeszcze nie' : times(h.times)}</span>
        </li>
      {/each}
    </ul>
  </section>
</div>
