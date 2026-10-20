<!--
  The story player (`/child/:id/stories/:storyId`; PLAN.md "Stories"; STATE.md decision 86).
  The Polish intro, then page by page: the scene, and its one English sentence spoken at the
  🐢/🐇 speed, the word being spoken marked in the text and its picture bouncing. Then the page
  holds for a moment and turns by itself. A tap on a picture says its word (during the sentence
  that cuts it, and the sentence starts again). 🔊 reads the page again. At the end the story
  is recorded as heard, Polly cheers, and the child is back on the shelf. The long-press home
  leaves at any time. The text is for the parent; nothing here needs reading.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { replace } from 'svelte-spa-router';
  import ChildLayout from '../../lib/components/ChildLayout.svelte';
  import ContentImage from '../../lib/components/ContentImage.svelte';
  import HomeButton from '../../lib/components/HomeButton.svelte';
  import PollyBuddy, { type Mood } from '../../lib/components/PollyBuddy.svelte';
  import RepeatButton from '../../lib/components/RepeatButton.svelte';
  import Scene from '../../lib/components/Scene.svelte';
  import SpeedToggle from '../../lib/components/SpeedToggle.svelte';
  import { prompt, stories, word as wordById } from '../../lib/content';
  import { loadFamily } from '../../lib/db';
  import { liveChild } from '../../lib/domain/children';
  import { wordStates } from '../../lib/domain/learning';
  import { INTRO_PAUSE_MS, PAGE_HOLD_MS, PAGE_TURN_MS, mentions, recordStory, storyOpen } from '../../lib/domain/stories';
  import { sounds } from '../../lib/sound/effects';
  import { speaker } from '../../lib/speech';
  import { speed } from '../../lib/speech/speed.svelte';
  import { wordRanges } from '../../lib/speech/timing';
  import { change } from '../../lib/store';
  import { unlock } from '../../lib/unlock';
  import type { Screen } from '../../lib/screens';
  import type { Story } from '../../lib/types';

  let { screen, params }: { screen: Screen; params?: Record<string, string> | null } = $props();

  /** After a tap cut the sentence, this much quiet before it is read again. */
  const AFTER_TAP_MS = 700;
  /** The end of the story stays at least this long. */
  const END_MS = 2000;

  const childId = $derived(params?.id ?? '');
  const shelf = $derived(`/child/${childId}/stories`);

  let story = $state<Story | undefined>();
  let pageIndex = $state(0);
  let spokenWord = $state(-1);
  let ended = $state(false);
  let mood = $state<Mood>('idle');
  let beat = $state(0);

  const page = $derived(story?.pages[pageIndex]);
  const named = $derived(page ? mentions(page, wordById) : []);
  const bouncing = $derived(new Set(named[spokenWord] ?? []));
  const pieces = $derived(page ? textPieces(page.text) : []);

  /** Bumped on leaving and on reopening, so an older run stops. */
  let run = 0;
  /** Set by a tap on a picture while the sentence is read: read it again afterwards. */
  let interrupted = false;
  /** Set by 🔊: read the page again from the start. */
  let again = false;
  /** The word a tap is saying, if any. */
  let tapping: Promise<unknown> = Promise.resolve();
  /** When the page was last touched, for the hold. */
  let touched = 0;

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  $effect(() => {
    void open(childId, params?.storyId ?? '');
  });

  onDestroy(() => {
    run += 1;
    speaker().cancel();
  });

  async function open(child: string, id: string) {
    const mine = ++run;
    story = undefined;
    ended = false;
    const file = await loadFamily();
    if (!liveChild(file, child)) return replace('/');
    const found = stories.find((s) => s.id === id);
    if (!found || !storyOpen(found, wordStates(file.progress[child]))) return replace(`/child/${child}/stories`);
    story = found;
    pageIndex = 0;
    if (mine === run) void play(mine, found);
  }

  /** The sentence split into the words the highlight counts (`wordRanges`) and what lies between. */
  function textPieces(text: string): { text: string; word: number }[] {
    const out: { text: string; word: number }[] = [];
    let at = 0;
    for (const [i, r] of wordRanges(text).entries()) {
      if (r.start > at) out.push({ text: text.slice(at, r.start), word: -1 });
      out.push({ text: r.text, word: i });
      at = r.end;
    }
    if (at < text.length) out.push({ text: text.slice(at), word: -1 });
    return out;
  }

  async function play(mine: number, s: Story) {
    if (s.introPl) {
      await speaker().saySegments([{ lang: 'pl', text: s.introPl }], speed.value);
      if (mine !== run) return;
      await wait(INTRO_PAUSE_MS);
    }
    for (const [i, p] of s.pages.entries()) {
      if (mine !== run) return;
      pageIndex = i;
      do {
        again = false;
        await read(mine, p.text);
        if (mine !== run) return;
        await hold(mine);
      } while (again && mine === run);
      if (mine !== run) return;
      if (i < s.pages.length - 1) await wait(PAGE_TURN_MS);
    }
    if (mine === run) await end(s);
  }

  /** The page's sentence, read again when a tap cut it. */
  async function read(mine: number, text: string) {
    for (;;) {
      interrupted = false;
      spokenWord = -1;
      const outcome = await speaker().speakSentences([text], { speed: speed.value, onWord: (_s, w) => (spokenWord = w) });
      spokenWord = -1;
      if (mine !== run || outcome !== 'cancelled' || !interrupted) return;
      await tapping;
      await wait(AFTER_TAP_MS);
      if (mine !== run || again) return;
    }
  }

  /** The page stays until it has been left alone for `PAGE_HOLD_MS`. */
  async function hold(mine: number) {
    touched = Date.now();
    while (mine === run && !again) {
      const left = touched + PAGE_HOLD_MS - Date.now();
      if (left <= 0) return;
      await wait(Math.min(left, 200));
    }
  }

  async function end(s: Story) {
    ended = true;
    mood = 'happy';
    beat += 1;
    sounds().play('sparkle');
    const saved = change((file, _now, device) => recordStory(file, childId, device, s.id));
    await Promise.all([saved, wait(END_MS), speaker().sayPrompt(prompt('story.end'), speed.value)]);
    if (ended) await replace(shelf);
  }

  function tap(i: number) {
    unlock();
    const item = page?.scene[i];
    if (!item || ended) return;
    touched = Date.now();
    sounds().play('tap');
    interrupted = true;
    const w = item.word ? wordById(item.word) : undefined;
    // Polly herself has no word: she hops.
    if (!w) {
      mood = 'happy';
      beat += 1;
      return;
    }
    tapping = speaker().sayWord(w, speed.value);
    void tapping.then(() => (touched = Date.now()));
  }

  function repeat() {
    if (ended) return;
    again = true;
    speaker().cancel();
  }
</script>

<ChildLayout>
  <h1 class="sr-only">{screen.title}</h1>
  {#if story && page}
    <header class="flex items-center justify-between gap-3 p-3">
      <HomeButton onexit={() => replace(shelf)} />
      <ol class="flex gap-2" aria-label="Strony" data-testid="pages">
        {#each story.pages as _, i (i)}
          <li class="lesson-dot" class:is-done={i < pageIndex} class:is-now={i === pageIndex}></li>
        {/each}
      </ol>
      <SpeedToggle />
    </header>

    {#if ended}
      <div class="flex flex-1 flex-col items-center justify-center gap-4 p-6" data-testid="story-end">
        <ContentImage id="open-book" class="finish-island pointer-events-none size-28 object-contain" />
        <ContentImage id="parrot" class="finish-polly pointer-events-none size-32 object-contain drop-shadow-xl" />
      </div>
    {:else}
      <div class="flex flex-1 flex-col items-center justify-center gap-3 px-3" data-testid="story" data-story={story.id} data-page={pageIndex}>
        {#key pageIndex}
          <div class="story-page flex w-full flex-col items-center gap-3">
            <Scene items={page.scene} ontap={tap} {bouncing} />
            <p class="story-text text-center" data-testid="sentence" data-for-parent lang="en">
              {#each pieces as piece, i (i)}
                {#if piece.word >= 0}
                  <span class="story-word" class:is-spoken={piece.word === spokenWord} data-spoken={piece.word === spokenWord ? '' : undefined}
                    >{piece.text}</span
                  >
                {:else}{piece.text}{/if}
              {/each}
            </p>
          </div>
        {/key}
      </div>
    {/if}

    <footer class="flex items-end justify-between p-3">
      <PollyBuddy {mood} {beat} class="size-20" />
      {#if !ended}
        <RepeatButton onrepeat={repeat} />
      {/if}
    </footer>
  {/if}
</ChildLayout>
