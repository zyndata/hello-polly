<!--
  A child's profile (PLAN.md "Local data model"): a nickname, an avatar from the fixed set (no
  photos), and an optional birth year. Used by /setup, the parent panel and the child's page.
-->
<script lang="ts">
  import ContentImage from './ContentImage.svelte';
  import { avatars } from '../content';
  import { MAX_NAME_LENGTH, cleanBirthYear, cleanName } from '../domain/children';
  import type { ChildProfile, ImageId } from '../types';

  type Profile = Omit<ChildProfile, 'deleted'>;

  interface Props {
    initial?: Profile | undefined;
    submitLabel: string;
    onsubmit: (profile: Profile) => void;
    oncancel?: () => void;
  }

  let { initial, submitLabel, onsubmit, oncancel }: Props = $props();

  /** Polish names of the avatar animals, for screen readers and the parent. */
  const AVATAR_NAMES: Record<ImageId, string> = {
    fox: 'Lis',
    lion: 'Lew',
    panda: 'Panda',
    hippopotamus: 'Hipopotam',
    frog: 'Żaba',
    'service-dog': 'Piesek',
    penguin: 'Pingwin',
    koala: 'Koala'
  };

  const thisYear = new Date().getFullYear();
  // The form keeps its own copy: `initial` seeds it once.
  // svelte-ignore state_referenced_locally
  let name = $state(initial?.name ?? '');
  // svelte-ignore state_referenced_locally
  let avatar = $state<ImageId>(initial?.avatar ?? (avatars[0] as ImageId));
  // svelte-ignore state_referenced_locally
  let birthYear = $state<number | null | undefined>(initial?.birthYear ?? null);

  // A number input binds a number, or null/undefined when it is empty.
  const year = $derived(typeof birthYear === 'number' && !Number.isNaN(birthYear) ? birthYear : undefined);
  const yearValid = $derived(year === undefined || cleanBirthYear(year, thisYear) !== undefined);
  const valid = $derived(cleanName(name) !== '' && yearValid);

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!valid) return;
    const profile: Profile = { name: cleanName(name), avatar };
    const by = cleanBirthYear(year, thisYear);
    if (by !== undefined) profile.birthYear = by;
    onsubmit(profile);
  }
</script>

<form class="grid gap-4" onsubmit={submit} data-testid="child-form">
  <label class="grid gap-1">
    <span class="font-bold">Imię lub przezwisko</span>
    <input
      class="select"
      type="text"
      name="name"
      autocomplete="off"
      maxlength={MAX_NAME_LENGTH}
      required
      bind:value={name}
    />
    <span class="text-sm text-ink-muted">Wystarczy przezwisko. Widać je tylko w wyborze dziecka i w panelu rodzica.</span>
  </label>

  <fieldset class="grid gap-2">
    <legend class="mb-1 font-bold">Obrazek dziecka</legend>
    <div class="grid grid-cols-4 gap-2">
      {#each avatars as id (id)}
        <label class="avatar-option grid place-items-center rounded-2xl bg-white p-2 shadow-sm" class:is-chosen={avatar === id}>
          <input class="sr-only" type="radio" name="avatar" value={id} bind:group={avatar} aria-label={AVATAR_NAMES[id] ?? id} />
          <ContentImage id={id} class="pointer-events-none size-14 object-contain" />
        </label>
      {/each}
    </div>
  </fieldset>

  <label class="grid gap-1">
    <span class="font-bold">Rok urodzenia <span class="font-normal text-ink-muted">(nieobowiązkowo)</span></span>
    <input class="select w-32" type="number" name="birthYear" inputmode="numeric" min={thisYear - 18} max={thisYear} bind:value={birthYear} />
    {#if !yearValid}
      <span class="notice text-sm">Podaj rok od {thisYear - 18} do {thisYear} albo zostaw puste.</span>
    {/if}
  </label>

  <div class="flex flex-wrap gap-2">
    <button type="submit" class="button" disabled={!valid}>{submitLabel}</button>
    {#if oncancel}
      <button type="button" class="button-quiet" onclick={oncancel}>Anuluj</button>
    {/if}
  </div>
</form>
