<!--
  A content picture by id. Loads from where ImageSource says (jsDelivr in a tagged production
  build, the origin otherwise) and falls back to the origin once if that fails. Never
  draggable, so a long press on a phone does not pick the picture up.
-->
<script lang="ts">
  import { imageUrls } from '../images';
  import type { ImageId } from '../types';

  interface Props {
    id: ImageId;
    /** Empty for child screens, where the picture is spoken, not read. */
    alt?: string;
    class?: string;
  }

  let { id, alt = '', class: className = '' }: Props = $props();

  const urls = $derived(imageUrls(id));
  /** The id whose first URL failed; a new id starts from its first URL again. */
  let failedFor = $state<ImageId | null>(null);
  const src = $derived(failedFor === id && urls[1] ? urls[1] : urls[0]);
</script>

<img
  {src}
  {alt}
  class={className}
  draggable="false"
  data-image-id={id}
  onerror={() => {
    if (urls.length > 1) failedFor = id;
  }}
/>
