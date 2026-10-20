<!--
  The parent's word-plan editor (PLAN.md Phase 4 task 4; "Choosing the next words"): which
  topics are on, the queue of "these words next" (reordered with ↑/↓, STATE.md decision 38),
  words marked known or paused, and default or random order inside a topic. Every word is its
  picture (tap to hear it) with its state. The editor only reports the new plan; the screen
  stores it.
-->
<script lang="ts">
  import ContentImage from './ContentImage.svelte';
  import SpeakingPicture from './SpeakingPicture.svelte';
  import { topics, word } from '../content';
  import type { WordState } from '../domain/learning';
  import {
    STATUS_LABELS,
    dequeue,
    enqueue,
    moveQueued,
    pendingQueue,
    planWordStatus,
    pruneQueue,
    setKnown,
    setPaused,
    setRandomWithinTopic,
    setSortGame,
    setTopicEnabled
  } from '../domain/plan';
  import type { WordId, WordPlan } from '../types';

  interface Props {
    plan: WordPlan;
    /** Learning states of this child's words; empty for a child not created yet. */
    states?: ReadonlyMap<WordId, WordState>;
    onchange: (plan: WordPlan) => void;
  }

  let { plan: stored, states = new Map(), onchange: report }: Props = $props();

  // Words already met have left the queue; every change saves the queue without them.
  const plan = $derived(pruneQueue(stored, states));
  const onchange = (next: WordPlan) => report(pruneQueue(next, states));
  const queued = $derived(pendingQueue(plan, states).flatMap((id) => (word(id) ? [word(id)!] : [])));
</script>

<div class="grid gap-4" data-testid="plan-editor">
  <section class="grid gap-2" aria-labelledby="queue-title">
    <h3 id="queue-title" class="font-extrabold text-deep-sea">Kolejka: te słówka najpierw</h3>
    {#if queued.length === 0}
      <p class="text-sm text-ink-muted">
        Pusta. Dodaj słówka przyciskiem „Do kolejki” poniżej, a dziecko pozna je przed resztą, w tej kolejności.
      </p>
    {:else}
      <ol class="grid gap-2" data-testid="queue">
        {#each queued as w, i (w.id)}
          <li class="flex items-center gap-2 rounded-xl bg-foam p-2" data-queue-word={w.id}>
            <span class="w-6 text-center font-bold text-ink-muted">{i + 1}.</span>
            <ContentImage id={w.image} class="size-10 object-contain" />
            <span class="flex-1 leading-tight"><strong>{w.en}</strong> <span class="text-ink-muted">· {w.pl}</span></span>
            <button
              type="button"
              class="icon-button"
              aria-label="Wyżej: {w.pl}"
              disabled={i === 0}
              onclick={() => onchange(moveQueued(plan, w.id, -1))}>↑</button
            >
            <button
              type="button"
              class="icon-button"
              aria-label="Niżej: {w.pl}"
              disabled={i === queued.length - 1}
              onclick={() => onchange(moveQueued(plan, w.id, 1))}>↓</button
            >
            <button type="button" class="icon-button" aria-label="Usuń z kolejki: {w.pl}" onclick={() => onchange(dequeue(plan, w.id))}
              >✕</button
            >
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <label class="choice">
    <input
      type="checkbox"
      checked={plan.randomWithinTopic}
      onchange={(e) => onchange(setRandomWithinTopic(plan, (e.currentTarget as HTMLInputElement).checked))}
    />
    Słówka z tematu w losowej kolejności
  </label>

  <label class="choice">
    <input
      type="checkbox"
      checked={plan.sortGame === true}
      data-testid="sort-game"
      onchange={(e) => onchange(setSortGame(plan, (e.currentTarget as HTMLInputElement).checked))}
    />
    Gra „Kosze”: układanie obrazków w dwóch koszykach według tematu (dla starszych dzieci)
  </label>

  <section class="grid gap-3" aria-labelledby="topics-title">
    <h3 id="topics-title" class="font-extrabold text-deep-sea">Tematy</h3>
    {#each topics as t (t.id)}
      {@const enabled = plan.enabledTopics.includes(t.id)}
      <details class="rounded-xl border border-sky/60 bg-white" data-topic={t.id}>
        <summary class="flex cursor-pointer items-center gap-3 p-2">
          <ContentImage id={t.icon} class="size-10 object-contain" />
          <span class="flex-1 font-bold">{t.pl}</span>
          <span class="text-sm text-ink-muted">{t.words.length} słówek</span>
        </summary>
        <div class="grid gap-3 border-t border-sky/40 p-2">
          <label class="choice">
            <input
              type="checkbox"
              checked={enabled}
              onchange={(e) => onchange(setTopicEnabled(plan, t.id, (e.currentTarget as HTMLInputElement).checked))}
            />
            Włączony: słówka z tego tematu przychodzą po kolei
          </label>
          <ul class="grid gap-2 sm:grid-cols-2">
            {#each t.words as id (id)}
              {@const w = word(id)}
              {#if w}
                {@const status = planWordStatus(plan, states, id)}
                {@const position = plan.queue.indexOf(id)}
                <li class="plan-word grid grid-cols-[auto_1fr] items-center gap-2 rounded-xl bg-foam p-2" data-plan-word={id}>
                  <SpeakingPicture word={w} class="size-16" />
                  <div class="grid gap-1">
                    <span class="leading-tight"><strong>{w.en}</strong> <span class="text-ink-muted">· {w.pl}</span></span>
                    <span class="text-sm" data-testid="status">
                      {STATUS_LABELS[status]}{#if position >= 0}<span class="text-ink-muted"> · w kolejce: {position + 1}.</span>{/if}
                    </span>
                    <div class="flex flex-wrap gap-1">
                      {#if position >= 0}
                        <button type="button" class="chip is-on" aria-pressed="true" onclick={() => onchange(dequeue(plan, id))}>W kolejce</button>
                      {:else}
                        <button type="button" class="chip" aria-pressed="false" onclick={() => onchange(enqueue(plan, id))}>Do kolejki</button>
                      {/if}
                      <button
                        type="button"
                        class="chip"
                        class:is-on={status === 'known'}
                        aria-pressed={status === 'known'}
                        onclick={() => onchange(setKnown(plan, id, status !== 'known'))}>Zna już</button
                      >
                      <button
                        type="button"
                        class="chip"
                        class:is-on={status === 'paused'}
                        aria-pressed={status === 'paused'}
                        onclick={() => onchange(setPaused(plan, id, status !== 'paused'))}>Wstrzymaj</button
                      >
                    </div>
                  </div>
                </li>
              {/if}
            {/each}
          </ul>
        </div>
      </details>
    {/each}
  </section>
</div>
