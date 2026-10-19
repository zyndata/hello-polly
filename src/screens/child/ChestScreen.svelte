<!--
  Opening a treasure chest (`/child/:id/chest`; PLAN.md "Rewards", STATE.md decisions 58–60).
  The chest fills the screen with a pulsing ring as the cue. Tap 1 rattles it, tap 2 pops the
  lock, tap 3 swings the lid open with a gold glow and 1–3 stickers fly out; each is then said
  in English, and a tap on one says it again. The opening is recorded the moment the lid opens;
  leaving before that keeps the chest waiting. A pulsing ▶ then leads to the album, where the
  new stickers are ringed. With no chest waiting, the route goes back to the map.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { replace } from 'svelte-spa-router';
  import Chest from '../../lib/components/Chest.svelte';
  import ChildLayout from '../../lib/components/ChildLayout.svelte';
  import HomeButton from '../../lib/components/HomeButton.svelte';
  import PollyBuddy, { type Mood } from '../../lib/components/PollyBuddy.svelte';
  import SpeakingPicture from '../../lib/components/SpeakingPicture.svelte';
  import SpeedToggle from '../../lib/components/SpeedToggle.svelte';
  import { prompt, stickers, topics, word } from '../../lib/content';
  import { loadFamily } from '../../lib/db';
  import { liveChild } from '../../lib/domain/children';
  import { readSettings } from '../../lib/domain/family';
  import { recordChest } from '../../lib/domain/progress';
  import { chestState } from '../../lib/domain/rewards';
  import { drawForChild } from '../../lib/domain/stickers';
  import { sounds } from '../../lib/sound/effects';
  import { speaker } from '../../lib/speech';
  import { speed } from '../../lib/speech/speed.svelte';
  import { change } from '../../lib/store';
  import { unlock } from '../../lib/unlock';
  import type { Screen } from '../../lib/screens';
  import type { Sticker, Word } from '../../lib/types';

  let { screen, params }: { screen: Screen; params?: Record<string, string> | null } = $props();

  /** Taps that open the chest. */
  const TAPS_TO_OPEN = 3;

  const childId = $derived(params?.id ?? '');
  const map = $derived(`/child/${childId}`);
  /** This opening's event id: the key in `chestsOpened` and the seed of the draw. */
  const eventId = crypto.randomUUID();

  let ready = $state(false);
  let stage = $state<0 | 1 | 2 | 3>(0);
  let beat = $state(0);
  let found = $state<{ sticker: Sticker; word: Word }[]>([]);
  let done = $state(false);
  let mood = $state<Mood>('idle');
  let moodBeat = $state(0);

  onMount(() => {
    void (async () => {
      const file = await loadFamily();
      if (!liveChild(file, childId)) return replace('/');
      if (chestState(file.progress[childId], readSettings(file).starsPerChest).unopened <= 0) return replace(map);
      ready = true;
      if (speaker().isUnlocked) void speaker().sayPrompt(prompt('chest.tap'), speed.value);
    })();
  });

  function react(next: Mood) {
    mood = next;
    moodBeat += 1;
  }

  function tap() {
    if (stage >= TAPS_TO_OPEN) return;
    unlock();
    beat += 1;
    if (stage === 0) {
      stage = 1;
      sounds().play('chest-creak');
      void speaker().sayPrompt(prompt('chest.again'), speed.value);
    } else if (stage === 1) {
      stage = 2;
      sounds().play('pop');
      void speaker().sayPrompt(prompt('chest.again'), speed.value);
    } else {
      void open();
    }
  }

  async function open() {
    stage = 3;
    sounds().play('sparkle');
    sounds().play('correct');
    react('happy');
    let drawn: string[] = [];
    await change((file, now, device) => {
      // Read again inside the write: another tab or a sync may have opened it meanwhile.
      if (chestState(file.progress[childId], readSettings(file).starsPerChest).unopened <= 0) return file;
      drawn = drawForChild(file, childId, stickers, topics, eventId);
      return recordChest(file, childId, device, eventId, { at: now, stickers: drawn });
    });
    found = drawn.flatMap((id) => {
      const sticker = stickers.find((s) => s.id === id);
      const w = sticker?.word === undefined ? undefined : word(sticker.word);
      return sticker && w ? [{ sticker, word: w }] : [];
    });
    if (found.length === 0) return replace(map);
    await speaker().sayPrompt(prompt('chest.open'), speed.value);
    for (const f of found) await speaker().sayWord(f.word, speed.value);
    done = true;
  }

  function toAlbum() {
    unlock();
    sounds().play('tap');
    const fresh = found.map((f) => encodeURIComponent(f.sticker.id)).join(',');
    void replace(`/child/${childId}/album?new=${fresh}`);
  }
</script>

<ChildLayout>
  <h1 class="sr-only">{screen.title}</h1>
  {#if ready}
    <header class="flex items-center justify-between gap-3 p-3">
      <HomeButton onexit={() => replace(map)} />
      <SpeedToggle />
    </header>

    <div class="flex flex-1 flex-col items-center justify-center gap-4 p-4" data-testid="chest-scene" data-stage={stage}>
      {#if found.length > 0}
        <ul class="chest-stickers flex flex-wrap justify-center gap-4" data-testid="chest-stickers">
          {#each found as f, i (f.sticker.id)}
            <li class="chest-sticker chest-sticker-{i}" data-sticker-id={f.sticker.id} data-rare={f.sticker.rare ? 'true' : 'false'}>
              <SpeakingPicture word={f.word} class="sticker sticker-big {f.sticker.rare ? 'is-rare' : ''}" />
            </li>
          {/each}
        </ul>
      {/if}

      <button
        type="button"
        class="chest-target"
        class:is-cued={stage < TAPS_TO_OPEN}
        class:is-open={stage === TAPS_TO_OPEN}
        aria-label="Skrzynia skarbów"
        data-testid="chest-open"
        disabled={stage >= TAPS_TO_OPEN}
        onclick={tap}
      >
        <Chest {stage} {beat} class="pointer-events-none h-full w-full" />
      </button>

      <div class="grid h-28 place-items-center">
        {#if done}
          <button type="button" class="next-button" aria-label="Do albumu" data-testid="next" onclick={toAlbum}>
            <svg viewBox="0 0 48 48" class="pointer-events-none h-full w-full" aria-hidden="true" focusable="false">
              <path d="M18 12 L 36 24 L 18 36 Z" class="fill-white" />
            </svg>
          </button>
        {/if}
      </div>
    </div>

    <footer class="flex items-end p-3">
      <PollyBuddy {mood} beat={moodBeat} class="size-20" />
    </footer>
  {/if}
</ChildLayout>
