<!--
  The sticker album (`/child/:id/album`; PLAN.md "Rewards", STATE.md decision 62). One page per
  set, chosen by a row of big topic pictures (no arrows, no page numbers). Each page is a grid
  of slots: an owned sticker says its word when tapped (a rare one has a gold edge that
  shimmers); an empty slot shows the picture's faint silhouette, and a tap on it wiggles and
  says „Tej naklejki jeszcze nie masz.” Coming from a chest (`?new=…`), the album opens on the
  page of the first new sticker and rings the new ones. Long-press home back to the map.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { replace, router } from 'svelte-spa-router';
  import ChildLayout from '../../lib/components/ChildLayout.svelte';
  import ContentImage from '../../lib/components/ContentImage.svelte';
  import HomeButton from '../../lib/components/HomeButton.svelte';
  import SpeakingPicture from '../../lib/components/SpeakingPicture.svelte';
  import SpeedToggle from '../../lib/components/SpeedToggle.svelte';
  import { prompt, stickers, topic, topics, word } from '../../lib/content';
  import { loadFamily } from '../../lib/db';
  import { liveChild } from '../../lib/domain/children';
  import { album } from '../../lib/domain/rewards';
  import { albumPages, type AlbumPage } from '../../lib/domain/stickers';
  import { sounds } from '../../lib/sound/effects';
  import { speaker } from '../../lib/speech';
  import { speed } from '../../lib/speech/speed.svelte';
  import { unlock } from '../../lib/unlock';
  import type { Screen } from '../../lib/screens';
  import type { ImageId } from '../../lib/types';

  let { screen, params }: { screen: Screen; params?: Record<string, string> | null } = $props();

  const childId = $derived(params?.id ?? '');
  let ready = $state(false);
  let pages = $state<AlbumPage[]>([]);
  let owned = $state<Set<string>>(new Set());
  let fresh = $state<Set<string>>(new Set());
  let page = $state(0);
  let nudges = $state<Record<string, number>>({});

  const current = $derived(pages[page]);

  /** A page's tab: its topic's picture, or else its first sticker's. */
  const tabImage = (p: AlbumPage): ImageId => topic(p.set)?.icon ?? p.stickers[0]?.image ?? 'ledger';
  const tabLabel = (p: AlbumPage): string => topic(p.set)?.pl ?? p.set;

  onMount(() => {
    void (async () => {
      const file = await loadFamily();
      if (!liveChild(file, childId)) return replace('/');
      owned = album(file.progress[childId]);
      pages = albumPages(stickers, owned, topics);
      const query = new URLSearchParams(router.querystring ?? '');
      fresh = new Set((query.get('new') ?? '').split(',').filter((id) => owned.has(id)));
      const first = pages.findIndex((p) => p.stickers.some((s) => fresh.has(s.id)));
      page = first >= 0 ? first : Math.max(0, pages.findIndex((p) => p.owned > 0));
      ready = true;
      if (speaker().isUnlocked) void speaker().sayPrompt(prompt(owned.size > 0 ? 'album.look' : 'album.empty'), speed.value);
    })();
  });

  function turn(to: number) {
    unlock();
    if (to === page) return;
    sounds().play('tap');
    page = to;
  }

  function missing(id: string) {
    unlock();
    nudges[id] = (nudges[id] ?? 0) + 1;
    sounds().play('wiggle');
    void speaker().sayPrompt(prompt('album.missing'), speed.value);
  }
</script>

<ChildLayout>
  <h1 class="sr-only">{screen.title}</h1>
  {#if ready && current}
    <header class="flex items-center justify-between gap-3 p-3">
      <HomeButton onexit={() => replace(`/child/${childId}`)} />
      <SpeedToggle />
    </header>

    <nav class="flex flex-wrap justify-center gap-3 px-3" aria-label="Strony albumu" data-testid="album-tabs">
      {#each pages as p, i (p.set)}
        <button
          type="button"
          class="album-tab size-tap rounded-2xl bg-foam/85 p-2"
          class:is-chosen={i === page}
          aria-label={tabLabel(p)}
          aria-pressed={i === page}
          data-set={p.set}
          onclick={() => turn(i)}
        >
          <ContentImage id={tabImage(p)} class="pointer-events-none h-full w-full object-contain" />
        </button>
      {/each}
    </nav>

    <section class="flex-1 overflow-y-auto p-4" data-testid="album-page" data-set={current.set} data-owned={current.owned}>
      <ul class="album-grid mx-auto rounded-card bg-sand/90 p-4 shadow-lg">
        {#each current.stickers as s (s.id)}
          {@const w = s.word === undefined ? undefined : word(s.word)}
          <li class="album-slot" data-sticker-id={s.id} data-owned={owned.has(s.id) ? 'true' : 'false'} data-rare={s.rare ? 'true' : 'false'}>
            {#if owned.has(s.id) && w}
              <SpeakingPicture word={w} class="sticker h-full w-full {s.rare ? 'is-rare' : ''} {fresh.has(s.id) ? 'is-new' : ''}" />
            {:else}
              {#key nudges[s.id] ?? 0}
                <button
                  type="button"
                  class="sticker-empty h-full w-full rounded-card p-3"
                  class:is-nudged={(nudges[s.id] ?? 0) > 0}
                  aria-label="Pusto"
                  onclick={() => missing(s.id)}
                >
                  <ContentImage id={s.image} class="silhouette pointer-events-none h-full w-full object-contain" />
                </button>
              {/key}
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</ChildLayout>
