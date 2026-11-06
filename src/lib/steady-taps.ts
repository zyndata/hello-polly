/**
 * Taps that a pre-reader's finger can actually make (STATE.md decision 103).
 *
 * A small child often rests a finger on a picture instead of tapping it. Phone browsers then
 * turn the touch into a long press: Chrome on Android sends `contextmenu` and no `click`, and a
 * finger that slides a little becomes a pan, which also ends without a `click`. To the child
 * the picture simply ignored them.
 *
 * Installed once on the child screens' root, this action watches every press on a tap target
 * (`button` or `[role="button"]`). When the finger lifts over the same target it was put down
 * on, and the browser sends no `click` of its own soon after, the action sends one. A browser
 * click that turns up after the action's own is swallowed, so a press never counts twice.
 * Nothing changes for an ordinary quick tap, a mouse, or a keyboard: their click arrives first.
 */

const TARGET = 'button, [role="button"]';

/** How long to wait for the browser's own click after the finger lifts. */
export const NATIVE_CLICK_WAIT_MS = 250;
/** How long after a sent click a late browser click on the same target is dropped. */
const LATE_CLICK_MS = 1000;

const targetOf = (node: EventTarget | null): Element | null => (node instanceof Element ? node.closest(TARGET) : null);
const isDisabled = (el: Element) => (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';

export function steadyTaps(root: HTMLElement): { destroy: () => void } {
  /** The press in progress: its pointer and the target under it. */
  let pressed: { pointer: number; target: Element } | null = null;
  /** A lift waiting for the browser's click. */
  let pending: { target: Element; timer: ReturnType<typeof setTimeout> } | null = null;
  /** The target the action clicked last, and when. */
  let sent: { target: Element; at: number } | null = null;
  let sending = false;

  function down(e: PointerEvent) {
    if (!e.isPrimary || e.button !== 0) return;
    const target = targetOf(e.target);
    pressed = target && root.contains(target) && !isDisabled(target) ? { pointer: e.pointerId, target } : null;
  }

  function up(e: PointerEvent) {
    if (!pressed || e.pointerId !== pressed.pointer) return;
    const { target } = pressed;
    pressed = null;
    // A touch keeps reporting to where it started, so ask what is under the finger now.
    if (targetOf(document.elementFromPoint(e.clientX, e.clientY)) !== target) return;
    if (pending) clearTimeout(pending.timer);
    pending = {
      target,
      timer: setTimeout(() => {
        pending = null;
        if (!target.isConnected || isDisabled(target)) return;
        sent = { target, at: performance.now() };
        sending = true;
        try {
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        } finally {
          sending = false;
        }
      }, NATIVE_CLICK_WAIT_MS)
    };
  }

  function cancel(e: PointerEvent) {
    if (pressed?.pointer === e.pointerId) pressed = null;
  }

  function click(e: MouseEvent) {
    if (sending) return;
    const target = targetOf(e.target);
    if (pending && pending.target === target) {
      // The browser clicked after all.
      clearTimeout(pending.timer);
      pending = null;
      return;
    }
    if (sent && sent.target === target && performance.now() - sent.at < LATE_CLICK_MS) {
      sent = null;
      e.stopPropagation();
      e.preventDefault();
    }
  }

  // No long-press menu on a child screen, on anything.
  const menu = (e: Event) => e.preventDefault();

  root.addEventListener('pointerdown', down, true);
  root.addEventListener('pointerup', up, true);
  root.addEventListener('pointercancel', cancel, true);
  root.addEventListener('click', click, true);
  root.addEventListener('contextmenu', menu);
  return {
    destroy() {
      if (pending) clearTimeout(pending.timer);
      root.removeEventListener('pointerdown', down, true);
      root.removeEventListener('pointerup', up, true);
      root.removeEventListener('pointercancel', cancel, true);
      root.removeEventListener('click', click, true);
      root.removeEventListener('contextmenu', menu);
    }
  };
}
