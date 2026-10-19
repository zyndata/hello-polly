/**
 * Local writes to the family file, stamped with the current time and this device's id. Screens
 * pass one of the pure `domain/` functions; the read-change-write is one transaction.
 */

import { getDeviceId, updateFamily } from './db';
import type { DeviceId, FamilyFile, Instant } from './types';

export async function change(edit: (file: FamilyFile, now: Instant, device: DeviceId) => FamilyFile): Promise<FamilyFile> {
  const device = await getDeviceId();
  return updateFamily((file) => edit(file, new Date().toISOString(), device));
}
