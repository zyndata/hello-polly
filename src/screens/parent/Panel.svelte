<!--
  /parent, the parent panel (behind the gate): the children, adding one, and the way to the
  other parent screens. Each child's words, queue and profile are on /parent/child/:id.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import ChildForm from '../../lib/components/ChildForm.svelte';
  import ContentImage from '../../lib/components/ContentImage.svelte';
  import ParentLayout from '../../lib/components/ParentLayout.svelte';
  import { loadFamily } from '../../lib/db';
  import { addChild, liveChildren, type ChildEntry } from '../../lib/domain/children';
  import { change } from '../../lib/store';
  import type { Screen } from '../../lib/screens';
  import type { ChildProfile } from '../../lib/types';

  let { screen }: { screen: Screen; params?: Record<string, string> | null } = $props();

  let children = $state<ChildEntry[]>([]);
  let loaded = $state(false);
  let adding = $state(false);

  onMount(() => {
    void (async () => {
      children = liveChildren(await loadFamily());
      loaded = true;
    })();
  });

  async function add(profile: Omit<ChildProfile, 'deleted'>) {
    const id = crypto.randomUUID();
    const file = await change((f, now, device) => addChild(f, id, profile, now, device));
    children = liveChildren(file);
    adding = false;
  }
</script>

<ParentLayout title={screen.title}>
  <section class="card" aria-labelledby="children-title">
    <h2 id="children-title" class="card-title">Dzieci</h2>
    {#if loaded && children.length === 0}
      <p class="text-ink-muted">Nie ma jeszcze żadnego dziecka.</p>
    {/if}
    <ul class="grid gap-2" data-testid="children">
      {#each children as child (child.id)}
        <li>
          <a class="flex items-center gap-3 rounded-xl bg-foam p-2 hover:bg-sky/40" href="#/parent/child/{child.id}" data-child-id={child.id}>
            <ContentImage id={child.profile.avatar} class="size-12 object-contain" />
            <span class="flex-1 text-lg font-bold">{child.profile.name}</span>
            <span class="text-sm text-ink-muted">Słówka i profil ›</span>
          </a>
        </li>
      {/each}
    </ul>
    {#if adding}
      <h3 class="font-extrabold text-deep-sea">Nowe dziecko</h3>
      <ChildForm submitLabel="Dodaj dziecko" onsubmit={add} oncancel={() => (adding = false)} />
    {:else}
      <button type="button" class="button justify-self-start" onclick={() => (adding = true)}>Dodaj dziecko</button>
    {/if}
    {#if children.length >= 2}
      <p class="text-sm text-ink-muted">Przy dwójce lub więcej dzieci ekran startowy pokazuje wybór dziecka.</p>
    {/if}
  </section>

  <section class="card" aria-labelledby="more-title">
    <h2 id="more-title" class="card-title">Ustawienia</h2>
    <ul class="grid gap-2">
      <li><a class="link" href="#/parent/speech">Mowa i głosy</a> <span class="text-ink-muted">: akcent, tempo, sprawdzenie głosu</span></li>
      <li><a class="link" href="#/parent/family">Rodzina</a> <span class="text-ink-muted">: zapis na Dysku Google i drugi rodzic</span></li>
    </ul>
  </section>

  <button type="button" class="button self-start" onclick={() => push('/')} data-testid="to-child">Wróć do dziecka</button>
</ParentLayout>
