/**
 * Export and import of the family as JSON, a local backup independent of Drive (PLAN.md Phase 10
 * task 4; STATE.md decision 97). The backup is the family file exactly as stored; importing it
 * is the same join as sync, so it never loses anything already on the device.
 */

import type { Day, FamilyFile } from '../types';
import { liveChildren } from './children';
import { mergeFamily } from './merge';

/** The downloaded file's name. */
export const backupFileName = (day: Day): string => `hello-polly-rodzina-${day}.json`;

/** The backup as text: the family file, nothing local-only (it holds none). */
export const exportFamily = (file: FamilyFile): string => JSON.stringify(file, null, 2);

/**
 * The local file with the backup merged in. A device with no children takes the backup's
 * `familyId`, so a fresh profile ends up with the exported file itself; otherwise the device's
 * own family keeps its id.
 */
export function importFamily(local: FamilyFile, backup: FamilyFile): FamilyFile {
  const merged = mergeFamily(local, backup);
  return { ...merged, familyId: liveChildren(local).length > 0 ? local.familyId : backup.familyId };
}
