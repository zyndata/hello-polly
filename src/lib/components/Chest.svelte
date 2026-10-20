<!--
  The pirate treasure chest, hand-drawn (PLAN.md "Rewards"; STATE.md decision 60). One drawing
  serves the map (small, waiting) and the chest scene (full screen). `stage` says how far it
  is opened: 0 shut, 1 rattled, 2 the lock popped, 3 the lid open with a gold glow. `beat`
  restarts the rattle on every tap. Colours come from classes; no inline style, and every
  motion is in app.css, where reduced motion keeps the end state and drops the travel.
-->
<script lang="ts">
  interface Props {
    stage?: 0 | 1 | 2 | 3;
    beat?: number;
    class?: string;
  }

  let { stage = 0, beat = 0, class: className = '' }: Props = $props();
</script>

<svg viewBox="0 0 200 180" class="chest {className}" data-stage={stage} aria-hidden="true" focusable="false">
  <!-- The glow behind an open chest. -->
  <g class="chest-glow" class:is-on={stage === 3}>
    <circle cx="100" cy="92" r="86" class="fill-white" opacity="0.3" />
    <circle cx="100" cy="92" r="64" class="fill-gold" opacity="0.7" />
  </g>
  {#key beat}
    <g class="chest-body" class:is-rattling={stage >= 1 && stage < 3 && beat > 0}>
      <!-- Inside of the lid and the treasure, seen when it is open. -->
      {#if stage === 3}
        <path d="M34 92 L 166 92 L 156 76 L 44 76 Z" class="fill-amber-950" />
        <ellipse cx="100" cy="88" rx="56" ry="10" class="fill-gold" />
        <circle cx="80" cy="84" r="6" class="fill-amber-300" />
        <circle cx="118" cy="83" r="7" class="fill-amber-300" />
        <circle cx="100" cy="80" r="5" class="fill-white" opacity="0.8" />
      {/if}
      <!-- The box. -->
      <rect x="30" y="90" width="140" height="74" rx="10" class="fill-amber-800 stroke-amber-950" stroke-width="4" />
      <path d="M30 112 L 170 112" class="stroke-amber-950" stroke-width="3" opacity="0.35" />
      <path d="M30 138 L 170 138" class="stroke-amber-950" stroke-width="3" opacity="0.35" />
      <rect x="44" y="90" width="14" height="74" class="fill-gold stroke-amber-700" stroke-width="2" />
      <rect x="142" y="90" width="14" height="74" class="fill-gold stroke-amber-700" stroke-width="2" />
      <!-- The lid: hinged at the back, it swings up and away. -->
      <g class="chest-lid" class:is-open={stage === 3}>
        <path d="M30 92 L 30 70 C 30 40, 170 40, 170 70 L 170 92 Z" class="fill-amber-700 stroke-amber-950" stroke-width="4" stroke-linejoin="round" />
        <path d="M44 92 L 44 54 C 50 48, 54 47, 58 46 L 58 92 Z" class="fill-gold stroke-amber-700" stroke-width="2" />
        <path d="M142 92 L 142 46 C 146 47, 150 48, 156 54 L 156 92 Z" class="fill-gold stroke-amber-700" stroke-width="2" />
        <path d="M30 92 L 170 92" class="stroke-amber-950" stroke-width="5" />
      </g>
      <!-- The lock: pops off on the second tap. -->
      <g class="chest-lock" class:is-popped={stage >= 2}>
        <path d="M88 86 C 88 72, 112 72, 112 86" fill="none" class="stroke-slate-500" stroke-width="5" />
        <rect x="82" y="84" width="36" height="32" rx="6" class="fill-gold stroke-amber-700" stroke-width="3" />
        <circle cx="100" cy="97" r="5" class="fill-amber-950" />
        <path d="M98 99 L 96 108 L 104 108 L 102 99 Z" class="fill-amber-950" />
      </g>
    </g>
  {/key}
</svg>
