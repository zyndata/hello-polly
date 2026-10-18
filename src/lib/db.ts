/**
 * IndexedDB, the source of truth (PLAN.md "Architecture"). Three stores:
 *
 * - `meta`: local-only key/value pairs. `deviceId` (created once per install, never synced) and
 *   `schema`; later the preferred voices, the Drive file id and the account label.
 * - `family`: the one local `FamilyFile`, under the key `local`. It has exactly the shape of the
 *   Drive file, so sync is a merge, never a migration.
 * - `syncBaseline`: the last family file seen on Drive (Phase 7).
 */

import Dexie, { type EntityTable } from 'dexie';
import { emptyFamily } from './domain/family';
import { FAMILY_SCHEMA, type DeviceId, type FamilyFile } from './types';

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface FamilyRow {
  id: 'local';
  file: FamilyFile;
}

export interface SyncBaselineRow {
  id: 'drive';
  fileId: string;
  /** Drive's `version` and `modifiedTime` of the file below. */
  version: string;
  modifiedTime: string;
  file: FamilyFile;
}

export const DB_NAME = 'hello-polly';

export class HelloPollyDb extends Dexie {
  declare meta: EntityTable<MetaRow, 'key'>;
  declare family: EntityTable<FamilyRow, 'id'>;
  declare syncBaseline: EntityTable<SyncBaselineRow, 'id'>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({ meta: 'key', family: 'id', syncBaseline: 'id' });
  }
}

let shared: HelloPollyDb | undefined;

/** The app's database, opened on first use. */
export function db(): HelloPollyDb {
  return (shared ??= new HelloPollyDb());
}

/** This install's device id, created on first call. Local only; it names this device's progress. */
export async function getDeviceId(database: HelloPollyDb = db()): Promise<DeviceId> {
  return database.transaction('rw', database.meta, async () => {
    const row = await database.meta.get('deviceId');
    if (typeof row?.value === 'string') return row.value;
    const id = crypto.randomUUID();
    await database.meta.bulkPut([
      { key: 'deviceId', value: id },
      { key: 'schema', value: FAMILY_SCHEMA }
    ]);
    return id;
  });
}

/** The local family file, created empty on first call. */
export async function loadFamily(database: HelloPollyDb = db()): Promise<FamilyFile> {
  return database.transaction('rw', database.family, async () => {
    const row = await database.family.get('local');
    if (row) return row.file;
    const file = emptyFamily(crypto.randomUUID());
    await database.family.put({ id: 'local', file });
    return file;
  });
}

export async function saveFamily(file: FamilyFile, database: HelloPollyDb = db()): Promise<void> {
  await database.family.put({ id: 'local', file });
}

/** Read, change and write the family file in one transaction, so two tabs never lose a write. */
export async function updateFamily(
  change: (file: FamilyFile) => FamilyFile,
  database: HelloPollyDb = db()
): Promise<FamilyFile> {
  return database.transaction('rw', database.family, async () => {
    const row = await database.family.get('local');
    const next = change(row?.file ?? emptyFamily(crypto.randomUUID()));
    await database.family.put({ id: 'local', file: next });
    return next;
  });
}

export async function getSyncBaseline(database: HelloPollyDb = db()): Promise<SyncBaselineRow | undefined> {
  return database.syncBaseline.get('drive');
}

export async function setSyncBaseline(baseline: SyncBaselineRow, database: HelloPollyDb = db()): Promise<void> {
  await database.syncBaseline.put(baseline);
}
