<!--
  A picture to paint (E8 *Pokoloruj*; STATE.md decision 88): the picture in grey, and once
  painted, the colour laid over it through a mask cut from the picture's own shape, multiplied
  with its grey shading. So any colour works on any picture. SVG attributes only, no style.
  One on screen at a time (its filter and mask ids are fixed).
-->
<script lang="ts">
  import { imageUrls } from '../images';
  import type { ImageId } from '../types';

  let { image, paint, class: className = '' }: { image: ImageId; paint?: string | undefined; class?: string } = $props();

  const urls = $derived(imageUrls(image));
  /** As in `ContentImage`: when the first URL fails, the origin, once. */
  let failedFor = $state<ImageId | null>(null);
  const href = $derived(failedFor === image && urls[1] ? urls[1] : urls[0]);
  const light = $derived(paint !== undefined && /^#f{6}$/i.test(paint));
</script>

<svg viewBox="0 0 100 100" class={className} aria-hidden="true" focusable="false" data-paint={paint ?? ''}>
  <defs>
    <filter id="paint-grey" color-interpolation-filters="sRGB">
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <filter id="paint-shape" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" />
    </filter>
    <mask id="paint-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <image {href} x="4" y="4" width="92" height="92" filter="url(#paint-shape)" preserveAspectRatio="xMidYMid meet" />
    </mask>
  </defs>
  <image
    {href}
    x="4"
    y="4"
    width="92"
    height="92"
    filter="url(#paint-grey)"
    class:paint-faded={paint === undefined}
    preserveAspectRatio="xMidYMid meet"
    data-image-id={image}
    onerror={() => {
      if (urls.length > 1) failedFor = image;
    }}
  />
  {#if paint !== undefined}
    <rect width="100" height="100" fill={paint} mask="url(#paint-mask)" class="paint-layer" class:is-light={light} />
  {/if}
</svg>
