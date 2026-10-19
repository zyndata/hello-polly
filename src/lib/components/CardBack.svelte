<!--
  The back of a *Memory* card, hand-drawn: a wave and a gold star on deep sea. No text.
-->
<script lang="ts">
  let { class: className = '' }: { class?: string } = $props();
</script>

<svg viewBox="0 0 60 60" class={className} aria-hidden="true" focusable="false">
  <rect x="2" y="2" width="56" height="56" rx="10" class="fill-deep-sea stroke-sky" stroke-width="3" />
  <path d="M8 42 C 16 36, 22 48, 30 42 S 44 36, 52 42" fill="none" stroke-width="3" stroke-linecap="round" class="stroke-lagoon" />
  <path d="M30 12l3.6 7.6 8.2 1-6 5.7 1.6 8.2L30 30.4l-7.4 4.1 1.6-8.2-6-5.7 8.2-1z" class="fill-gold" />
</svg>
