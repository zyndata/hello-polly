<!--
  A content picture inside an SVG: an `<image>` placed by attributes only (no inline style,
  STATE.md decision 85), loaded from where ImageSource says and falling back to the origin once,
  like `ContentImage`.
-->
<script lang="ts">
  import { imageUrls } from '../images';
  import type { ImageId } from '../types';

  interface Props {
    id: ImageId;
    x: number;
    y: number;
    width: number;
    height: number;
    class?: string;
  }

  let { id, x, y, width, height, class: className = '' }: Props = $props();

  const urls = $derived(imageUrls(id));
  let failedFor = $state<ImageId | null>(null);
  const href = $derived(failedFor === id && urls[1] ? urls[1] : urls[0]);
</script>

<image
  {href}
  {x}
  {y}
  {width}
  {height}
  class={className}
  preserveAspectRatio="xMidYMid meet"
  data-image-id={id}
  onerror={() => {
    if (urls.length > 1) failedFor = id;
  }}
/>
