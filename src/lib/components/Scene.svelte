<!--
  A scene (PLAN.md "Stories"; STATE.md decision 85): pictures on a hand-drawn beach, in one SVG
  of 100 × 75 placed by attributes only. Each item is a button: a tap is the screen's to answer
  (the story says the word, *Gdzie jest…?* checks it). An item can idle (`anim`), bounce while
  its word is spoken, wiggle after a wrong tap, glow as a hint, or shine when found.
-->
<script lang="ts">
  import SvgImage from './SvgImage.svelte';
  import { word as wordById } from '../content';
  import type { SceneItem } from '../types';

  interface Props {
    items: readonly SceneItem[];
    ontap: (index: number) => void;
    /** Items that bounce now (a story: their word is being spoken). */
    bouncing?: ReadonlySet<number>;
    /** Wrong taps per item: a new number wiggles it again. */
    wiggles?: Readonly<Record<number, number>>;
    glowing?: number;
    found?: ReadonlySet<number>;
    class?: string;
    testid?: string;
  }

  let { items, ontap, bouncing = new Set(), wiggles = {}, glowing = -1, found = new Set(), class: className = '', testid = 'scene' }: Props = $props();

  /** The scene's height: 4:3, as content is checked against (`SCENE_HEIGHT`). */
  const H = 75;
  /** The tap area reaches this far beyond the picture, so a small picture is still ≥ 72 px. */
  const PAD = 2;

  const box = (item: SceneItem) => {
    const cy = (item.y * H) / 100;
    return { x: item.x - item.size / 2, y: cy - item.size / 2, size: item.size };
  };

  function key(e: KeyboardEvent, i: number) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    ontap(i);
  }
</script>

<svg viewBox="0 0 100 {H}" class="scene {className}" data-testid={testid} aria-label="Scena" role="group">
  <defs>
    <linearGradient id="scene-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e3f2fd" />
      <stop offset="1" stop-color="#90caf9" />
    </linearGradient>
  </defs>
  <rect width="100" height={H} fill="url(#scene-sky)" />
  <circle cx="86" cy="11" r="7" fill="#ffc93c" opacity="0.85" />
  <path d="M0 52 Q 25 46 50 50 T 100 49 V 75 H 0 Z" fill="#26c6da" opacity="0.55" />
  <path d="M0 60 Q 30 50 60 56 T 100 54 V 75 H 0 Z" fill="#f6e3b4" />
  <path d="M0 68 Q 40 62 100 67 V 75 H 0 Z" fill="#ecd29a" />

  {#each items as item, i (i)}
    {@const b = box(item)}
    {@const w = item.word ? wordById(item.word) : undefined}
    <g class="scene-idle anim-{item.anim ?? 'none'}">
      {#key wiggles[i] ?? 0}
        <g
          class="scene-item"
          class:is-bouncing={bouncing.has(i)}
          class:is-wiggling={(wiggles[i] ?? 0) > 0}
          class:is-glowing={glowing === i}
          class:is-found={found.has(i)}
          role="button"
          tabindex="0"
          aria-label={w?.en ?? 'Polly'}
          data-scene-item={i}
          data-word-id={item.word}
          data-bouncing={bouncing.has(i) ? '' : undefined}
          data-glow={glowing === i ? '' : undefined}
          onclick={() => ontap(i)}
          onkeydown={(e) => key(e, i)}
        >
          <rect class="scene-hit" x={b.x - PAD} y={b.y - PAD} width={b.size + 2 * PAD} height={b.size + 2 * PAD} rx="4" />
          <SvgImage id={item.image} x={b.x} y={b.y} width={b.size} height={b.size} class="pointer-events-none" />
        </g>
      {/key}
    </g>
  {/each}
</svg>
