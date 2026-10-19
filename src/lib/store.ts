/**
 * Local writes to the family file, stamped with the current time and this device's id. Screens
 * pass one of the pure `domain/` functions; the read-change-write is one transaction.
 */

import { getDeviceId, updateFamily } from './db';
import type { DeviceId, FamilyFile, Instant } from './types';

const listeners = new Set<() => void>();

/** Called after every local write; the sync layer listens to schedule an upload. */
export function onLocalChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function change(edit: (file: FamilyFile, now: Instant, device: DeviceId) => FamilyFile): Promise<FamilyFile> {
  const device = await getDeviceId();
  const file = await updateFamily((current) => edit(current, new Date().toISOString(), device));
  for (const listener of listeners) listener();
  return file;
}
