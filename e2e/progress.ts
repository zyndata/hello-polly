import type { Page } from '@playwright/test';
import { BOX_INTERVALS } from '../src/lib/domain/learning';
import { addDays, localDay } from '../src/lib/domain/time';
import type { AttemptDay, ChildLimits, Day, DeviceProgress, FamilyFile, WordId } from '../src/lib/types';
import type { SessionClock } from '../src/lib/domain/screentime';

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

export async function writeFamily(page: Page, file: FamilyFile): Promise<void> {
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

/**
 * Stars (and chests already opened) earned on another device, as if synced from it. Keeps any
 * other progress that device has.
 */
export async function seedStars(page: Page, child: string, stars: number, opened: DeviceProgress['chestsOpened'] = {}): Promise<void> {
  const file = await readFamily(page);
  const current = file.progress[child]?.[SEED_DEVICE];
  const seeded: DeviceProgress = {
    seq: (current?.seq ?? 0) + 1,
    introduced: current?.introduced ?? {},
    attempts: current?.attempts ?? {},
    stars,
    chestsOpened: opened,
    lessons: current?.lessons ?? {},
    minutes: current?.minutes ?? {},
    storiesHeard: current?.storiesHeard ?? {}
  };
  file.progress[child] = { ...file.progress[child], [SEED_DEVICE]: seeded };
  await writeFamily(page, file);
}

/** The child's limits, written as a parent's change made just now on another device. */
export async function seedLimits(page: Page, child: string, limits: ChildLimits): Promise<void> {
  const file = await readFamily(page);
  file.limits[child] = { v: limits, t: new Date(Date.now() + 1000).toISOString(), d: SEED_DEVICE };
  await writeFamily(page, file);
}

/** Minutes played on another device on `day` (today by default), as if synced from it. */
export async function seedMinutes(page: Page, child: string, minutes: number, day = localDay(new Date())): Promise<void> {
  const file = await readFamily(page);
  const current = file.progress[child]?.[SEED_DEVICE];
  const base: DeviceProgress = current ?? { seq: 0, introduced: {}, attempts: {}, stars: 0, chestsOpened: {}, lessons: {}, minutes: {}, storiesHeard: {} };
  file.progress[child] = { ...file.progress[child], [SEED_DEVICE]: { ...base, seq: base.seq + 1, minutes: { ...base.minutes, [day]: minutes } } };
  await writeFamily(page, file);
}

/** This device's session clock for a child (local only, `meta.screenTime`). */
export async function sessionClock(page: Page, child: string): Promise<SessionClock | undefined> {
  return page.evaluate(
    (child) =>
      new Promise<SessionClock | undefined>((resolve, reject) => {
        const open = indexedDB.open('hello-polly');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('meta').objectStore('meta').get('screenTime');
          get.onsuccess = () => {
            open.result.close();
            resolve((get.result as { value: Record<string, SessionClock> } | undefined)?.value[child]);
          };
          get.onerror = () => reject(get.error);
        };
      }),
    child
  );
}
