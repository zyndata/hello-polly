import type { Page } from '@playwright/test';
import { BOX_INTERVALS } from '../src/lib/domain/learning';
import { addDays, localDay } from '../src/lib/domain/time';
import type { AttemptDay, Day, DeviceProgress, FamilyFile, WordId } from '../src/lib/types';

/** The device id under which seeded progress is written: another phone, as far as the app knows. */
export const SEED_DEVICE = 'e2e-seed-device';

/** The local family file, straight from IndexedDB. */
export async function readFamily(page: Page): Promise<FamilyFile> {
  return page.evaluate(
    () =>
      new Promise<FamilyFile>((resolve, reject) => {
        const open = indexedDB.open('hello-polly');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('family').objectStore('family').get('local');
          get.onsuccess = () => {
            open.result.close();
            resolve((get.result as { file: FamilyFile }).file);
          };
          get.onerror = () => reject(get.error);
        };
      })
  );
}

async function writeFamily(page: Page, file: FamilyFile): Promise<void> {
  await page.evaluate(
    (file) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('hello-polly');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('family', 'readwrite');
          tx.objectStore('family').put({ id: 'local', file });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    file
  );
}

/**
 * Attempts that make a word learned and climb it to `box`, with its review due `today`: two
 * days to learn it, then one clean answer on each due day (decision 17's rules).
 */
export function learnedHistory(today: Day, box: number): Record<Day, AttemptDay> {
  const steps: number[] = [];
  let due = 1;
  for (let b = 1; b < box; b++) {
    steps.push(due);
    due += BOX_INTERVALS[b] as number;
  }
  // Day offsets from the day the word was learned (offset 0); the review lands on `today`.
  const learnedOn = addDays(today, -due);
  const history: Record<Day, AttemptDay> = {
    [addDays(learnedOn, -1)]: { c: 2, w: 0, first: 2 },
    [learnedOn]: { c: 1, w: 0, first: 1 }
  };
  for (const offset of steps) history[addDays(learnedOn, offset)] = { c: 1, w: 0, first: 1 };
  return history;
}

/** Writes progress from another device in which the child has learned `words` (word → box). */
export async function seedLearned(page: Page, child: string, words: Record<WordId, number>): Promise<void> {
  const today = localDay(new Date());
  const file = await readFamily(page);
  const attempts: DeviceProgress['attempts'] = {};
  const introduced: DeviceProgress['introduced'] = {};
  for (const [word, box] of Object.entries(words)) {
    attempts[word] = learnedHistory(today, box);
    introduced[word] = new Date(Date.now() - 60 * 86_400_000).toISOString();
  }
  const seeded: DeviceProgress = {
    seq: 1,
    introduced,
    attempts,
    stars: 0,
    chestsOpened: {},
    lessons: {},
    minutes: {},
    storiesHeard: {}
  };
  file.progress[child] = { ...file.progress[child], [SEED_DEVICE]: seeded };
  await writeFamily(page, file);
}

/** This device's progress for a child (not the seeded one). */
export async function ownProgress(page: Page, child: string): Promise<DeviceProgress | undefined> {
  const file = await readFamily(page);
  return Object.entries(file.progress[child] ?? {}).find(([device]) => device !== SEED_DEVICE)?.[1];
}
