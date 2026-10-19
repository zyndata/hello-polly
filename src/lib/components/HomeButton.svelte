<!--
  The only way out of a child screen (PLAN.md "Visual design"): a house that needs a long press.
  While held, a gold ring fills around it; let go early and Polly says „Przytrzymaj dłużej,
  żeby wyjść.” A held Enter or Space works the same for a keyboard.
-->
<script lang="ts">
  import ContentImage from './ContentImage.svelte';
  import { prompt } from '../content';
  import { sounds } from '../sound/effects';
  import { speaker } from '../speech';
  import { speed } from '../speech/speed.svelte';
  import { unlock } from '../unlock';

  /** How long the press must last. */
  const HOLD_MS = 1000;

  let { onexit, class: className = '' }: { onexit: () => void; class?: string } = $props();

  let holding = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function begin() {
    if (holding) return;
    unlock();
    holding = true;
    timer = setTimeout(() => {
      timer = undefined;
      holding = false;
      sounds().play('pop');
      onexit();
    }, HOLD_MS);
  }

  function end() {
    if (!holding) return;
    holding = false;
    clearTimeout(timer);
    timer = undefined;
    void speaker().sayPrompt(prompt('home.hold'), speed.value);
  }

  const isHoldKey = (e: KeyboardEvent) => e.key === 'Enter' || e.key === ' ';
</script>

<button
  type="button"
  class="home-button size-tap shrink-0 rounded-full bg-foam/85 p-2 shadow-md {className}"
  class:is-holding={holding}
  aria-label="Wyjście: przytrzymaj"
  data-testid="home"
  onpointerdown={begin}
  onpointerup={end}
  onpointerleave={end}
  onpointercancel={end}
  oncontextmenu={(e) => e.preventDefault()}
  onkeydown={(e) => {
    if (isHoldKey(e)) {
      e.preventDefault();
      if (!e.repeat) begin();
    }
  }}
  onkeyup={(e) => {
    if (isHoldKey(e)) end();
  }}
>
  <span class="home-ring" aria-hidden="true"></span>
  <ContentImage id="house" class="pointer-events-none relative h-full w-full object-contain" />
</button>
