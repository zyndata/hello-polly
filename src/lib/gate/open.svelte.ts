/**
 * Whether the parent gate has been passed. In memory only: it opens the parent area until a
 * child screen is shown again, or the page is reloaded (STATE.md decision 37).
 */

let open = $state(false);

export const parentGate = {
  get isOpen(): boolean {
    return open;
  },
  pass(): void {
    open = true;
  },
  /** Every child screen calls this when it appears. */
  close(): void {
    open = false;
  }
};
