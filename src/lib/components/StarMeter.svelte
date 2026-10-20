<!--
  The star meter on the map (PLAN.md "Rewards"; STATE.md decision 61): a gold star, then a bar
  that fills toward the next chest. The fill is an SVG `width` attribute, never an inline
  style; it grows from empty on arrival (app.css). Nothing to read: the bar is the number.
-->
<script lang="ts">
  let { value, max }: { value: number; max: number } = $props();

  const total = $derived(Math.max(1, max));
  const filled = $derived(Math.min(total, Math.max(0, value)));
</script>

<span class="star-meter flex min-w-0 flex-1 items-center gap-2" data-testid="meter" data-value={filled} data-max={total} aria-label="Gwiazdki do skrzyni: {filled} z {total}" role="img">
  <svg viewBox="0 0 24 24" class="size-10 shrink-0 drop-shadow" aria-hidden="true" focusable="false">
    <path
      d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
      class="fill-gold stroke-amber-600"
      stroke-width="1"
      stroke-linejoin="round"
    />
  </svg>
  <svg viewBox="0 0 {total} 10" preserveAspectRatio="none" class="meter-bar h-6 w-full overflow-hidden rounded-full" aria-hidden="true" focusable="false">
    <rect x="0" y="0" width={total} height="10" class="fill-deep-sea" opacity="0.45" />
    {#if filled > 0}
      <rect x="0" y="0" width={filled} height="10" class="meter-fill fill-gold" />
    {/if}
  </svg>
</span>
