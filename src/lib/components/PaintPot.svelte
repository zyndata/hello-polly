<!--
  A paint pot (E8 *Pokoloruj*), drawn by hand: a jar with its paint on top and a drip. The
  colour is an SVG `fill` attribute.
-->
<script lang="ts">
  let { paint, class: className = '' }: { paint: string; class?: string } = $props();
</script>

<svg viewBox="0 0 64 64" class={className} aria-hidden="true" focusable="false">
  <path d="M12 22 h40 l-4 34 a4 4 0 0 1 -4 3.5 h-24 a4 4 0 0 1 -4 -3.5 z" fill="#cfd8dc" stroke="#78909c" stroke-width="2" />
  <rect x="12" y="30" width="40" height="6" fill="#b0bec5" />
  <ellipse cx="32" cy="22" rx="21" ry="7" fill={paint} stroke="#546e7a" stroke-width="2" />
  <path d="M40 24 q3 8 0 13 a3 3 0 0 1 -5 -1 q-1 -5 1 -10 z" fill={paint} stroke="#546e7a" stroke-width="1.5" />
  <ellipse cx="25" cy="20" rx="6" ry="2" fill="#ffffff" opacity="0.45" />
</svg>
