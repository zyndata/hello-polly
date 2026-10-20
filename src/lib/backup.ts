/**
 * The backup as a file (STATE.md decision 97): download the local family file, and read one
 * back with the same checks sync applies to the file on Drive.
 */

import { backupFileName, exportFamily } from './domain/backup';
import { localDay } from './domain/time';
import { NewerSchemaError, parseFamilyFile } from './sync/engine';
import type { FamilyFile } from './types';

/** Saves the family file as a JSON download. */
export function downloadBackup(file: FamilyFile, now = new Date()): void {
  const url = URL.createObjectURL(new Blob([exportFamily(file)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFileName(localDay(now));
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A chosen file as a family file, or a Polish sentence saying why it is not one. */
export async function readBackup(chosen: Blob): Promise<{ file: FamilyFile } | { error: string }> {
  try {
    return { file: parseFamilyFile(await chosen.text()) };
  } catch (error) {
    if (error instanceof NewerSchemaError) {
      return { error: 'Tę kopię zapisała nowsza wersja Hello Polly. Odśwież stronę, żeby zaktualizować aplikację.' };
    }
    return { error: 'To nie jest kopia zapasowa Hello Polly. Wybierz plik „hello-polly-rodzina-….json”.' };
  }
}
