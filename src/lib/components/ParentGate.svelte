<!--
  The parent gate (STATE.md decision 37): a two-digit number in Polish words, typed on a
  keypad. A miss draws a new number and pauses the keypad, longer each time. A child who got
  here by the gear has a big Polly to tap back to the sea. Passing it wakes a sleeping Polly.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import ContentImage from './ContentImage.svelte';
  import { erase, isLocked, newGate, polishNumber, press } from '../gate/gate';
  import { parentGate } from '../gate/open.svelte';
  import { screenTime } from '../screentime/clock.svelte';
  import { sounds } from '../sound/effects';
  import { renew } from '../sync/state.svelte';

  let gate = $state(newGate(Math.random));
  let now = $state(Date.now());
  /** Bumped on every miss, to replay the shake. */
  let misses = $state(0);

  const locked = $derived(isLocked(gate, now));
  const secondsLeft = $derived(Math.ceil((gate.lockedUntil - now) / 1000));

  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(timer);
  });

  function digit(d: number) {
    now = Date.now();
    const before = gate;
    gate = press(gate, d, now, Math.random);
    if (gate.passed) {
      sounds().play('correct');
      parentGate.pass();
      // The lock lifts after the gate (PLAN.md "Screen time"; STATE.md decision 94).
      void screenTime.wakeAll();
      // A parent's tap: the one moment a connected device may renew its Drive token without
      // the consent screen (STATE.md decision 66). Does nothing when not connected.
      void renew();
    } else if (gate.misses > before.misses) {
      misses = gate.misses;
      sounds().play('wiggle');
    }
  }

  function back() {
    now = Date.now();
    gate = erase(gate, now);
  }

  const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
</script>

<section class="card gap-4" aria-labelledby="gate-title" data-testid="gate">
  <h2 id="gate-title" class="card-title">Tylko dla rodzica</h2>
  <p>Wpisz cyframi liczbę:</p>
  {#key misses}
    <p class="gate-number text-center text-3xl font-extrabold text-deep-sea" class:is-missed={misses > 0} data-testid="gate-number">
      {polishNumber(gate.target)}
    </p>
  {/key}
  <p class="flex justify-center gap-3" aria-live="polite" data-testid="gate-entry">
    {#each [0, 1] as slot (slot)}
      <span class="grid h-14 w-12 place-items-center rounded-xl border-2 border-sky bg-white text-3xl font-extrabold">
        {gate.entered[slot] ?? ''}
      </span>
    {/each}
  </p>
  <!-- A fixed slot, so the keypad never moves under a finger. -->
  <p class="min-h-7" aria-live="polite">
    {#if locked}<span class="notice" data-testid="gate-locked">To nie ta liczba. Nowa za {secondsLeft} s.</span>{/if}
  </p>
  <div class="mx-auto grid w-full max-w-xs grid-cols-3 gap-2" role="group" aria-label="Klawiatura" data-testid="keypad">
    {#each KEYS as k (k)}
      <button type="button" class="keypad-key" disabled={locked} data-key={k} onclick={() => digit(k)}>{k}</button>
    {/each}
    <span></span>
    <button type="button" class="keypad-key" disabled={locked} data-key="0" onclick={() => digit(0)}>0</button>
    <button type="button" class="keypad-key" disabled={locked} aria-label="Usuń cyfrę" onclick={back}>⌫</button>
  </div>
  <p class="text-sm text-ink-muted">To zabezpieczenie przed dzieckiem, nie hasło: dorosły przejdzie w dwie sekundy.</p>
</section>

<button type="button" class="gate-back flex items-center gap-3 self-center rounded-full bg-ocean p-2 pr-6 text-lg font-bold text-white shadow-md" onclick={() => push('/')} data-testid="gate-back">
  <ContentImage id="parrot" class="pointer-events-none size-tap rounded-full bg-foam object-contain p-1" />
  Wróć do dziecka
</button>
