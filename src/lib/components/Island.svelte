<!--
  One island of the treasure map, hand-drawn (PLAN.md: the map islands are SVGs in the repo,
  not emoji): shallow water, sand, a palm, and a flag once its lesson is done. Colours come
  from the palette tokens through `fill-*` classes; no inline style.
-->
<script lang="ts">
  let { flag = false, class: className = '' }: { flag?: boolean; class?: string } = $props();
</script>

<svg viewBox="0 0 120 90" class={className} aria-hidden="true" focusable="false">
  <ellipse cx="60" cy="66" rx="56" ry="20" class="fill-lagoon" opacity="0.55" />
  <path d="M14 66 C 20 44, 46 38, 62 40 C 84 42, 104 50, 106 66 C 90 78, 30 80, 14 66 Z" class="fill-sand" />
  <path d="M30 70 C 46 76, 78 76, 96 68" fill="none" stroke-width="2" stroke-linecap="round" class="stroke-white" opacity="0.7" />
  <!-- The palm. -->
  <path d="M58 58 C 58 44, 54 32, 48 22" fill="none" stroke-width="5" stroke-linecap="round" class="stroke-amber-800" />
  <path d="M48 22 C 38 14, 26 16, 20 24 C 30 20, 40 22, 48 24 Z" class="fill-leaf" />
  <path d="M48 22 C 56 12, 70 12, 76 20 C 66 18, 56 20, 48 24 Z" class="fill-leaf" />
  <path d="M48 22 C 44 30, 36 36, 30 38 C 36 30, 42 26, 48 24 Z" class="fill-leaf" />
  <path d="M48 22 C 56 26, 62 34, 64 40 C 58 34, 52 28, 48 24 Z" class="fill-leaf" />
  {#if flag}
    <g data-flag>
      <path d="M82 58 L 82 22" stroke-width="3" stroke-linecap="round" class="stroke-deep-sea" />
      <path d="M83 23 L 104 30 L 83 38 Z" class="fill-coral" />
      <circle cx="90" cy="30" r="3" class="fill-gold" />
    </g>
  {/if}
</svg>
