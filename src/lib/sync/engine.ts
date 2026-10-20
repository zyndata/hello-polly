/**
 * One sync cycle (PLAN.md "Sync model"): check the file's version; if it moved, download and
 * merge it into the local copy; if the local copy has anything the file lacks, upload the merge;
 * remember what was seen as the baseline. The merge is a join, so this never asks anyone
 * anything, and a lost upload race only delays a delta by one cycle.
 */

import { getDeviceId, getSyncBaseline, loadFamily, updateFamily, type HelloPollyDb } from '../db';
import { tidyOwnProgress } from '../domain/compaction';
import { canonicalJson } from '../domain/lww';
import { mergeFamily } from '../domain/merge';
import { liveChildren } from '../domain/children';
import { localDay } from '../domain/time';
import { FAMILY_SCHEMA, type FamilyFile } from '../types';
import { RemoteChangedError, RemoteGoneError, type RemoteVersion, type StorageBackend } from './backend';

export const FAMILY_FILE_NAME = 'hello-polly-family.json';

/** Local-only `meta` keys (PLAN.md: the Drive file id and the account label never sync). */
export const META_FILE_ID = 'driveFileId';
export const META_ACCOUNT = 'driveAccount';
/** Whether the file is another parent's, shared with this account (decision 78). */
export const META_FILE_SHARED = 'driveFileShared';

/** A shared file this account can no longer reach: the owner removed it, or trashed the file. */
export class AccessRevokedError extends Error {
  constructor() {
    super('Access to the shared family file was taken away');
    this.name = 'AccessRevokedError';
  }
}

/** A file on Drive written by a newer app: never overwritten (STATE.md decision 70). */
export class NewerSchemaError extends Error {
  constructor() {
    super('The family file was written by a newer version of the app');
    this.name = 'NewerSchemaError';
  }
}

/** A file by that name that is not a family file: left alone, sync stops. */
export class InvalidRemoteError extends Error {
  constructor(message = 'The file on Drive is not a Hello Polly family file') {
    super(message);
    this.name = 'InvalidRemoteError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The downloaded text as a family file, or the reason it is not one. */
export function parseFamilyFile(text: string): FamilyFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InvalidRemoteError('The file on Drive is not JSON');
  }
  if (!isRecord(value) || typeof value.schema !== 'number' || typeof value.familyId !== 'string') {
    throw new InvalidRemoteError();
  }
  if (value.schema > FAMILY_SCHEMA) throw new NewerSchemaError();
  for (const key of ['settings', 'children', 'plans', 'limits', 'progress'] as const) {
    if (!isRecord(value[key])) throw new InvalidRemoteError(`The family file has no ${key}`);
  }
  return value as unknown as FamilyFile;
}

export const serializeFamily = (file: FamilyFile): string => JSON.stringify(file);

const same = (a: FamilyFile, b: FamilyFile): boolean => canonicalJson(a) === canonicalJson(b);

export interface SyncDeps {
  backend: StorageBackend;
  database: HelloPollyDb;
  now?: () => Date;
}

export interface SyncResult {
  version: RemoteVersion;
  downloaded: boolean;
  uploaded: boolean;
  /** The file was created by this cycle. */
  created: boolean;
}

/** How often a cycle re-merges after losing the write guard before leaving it to the next one. */
const MAX_ATTEMPTS = 3;

async function storedFileId(database: HelloPollyDb): Promise<string | undefined> {
  const row = await database.meta.get(META_FILE_ID);
  return typeof row?.value === 'string' ? row.value : undefined;
}

async function isShared(database: HelloPollyDb): Promise<boolean> {
  return (await database.meta.get(META_FILE_SHARED))?.value === true;
}

/** Use this file from now on; the baseline belonged to the previous one. */
async function adopt(database: HelloPollyDb, found: RemoteVersion): Promise<void> {
  await database.transaction('rw', database.meta, database.syncBaseline, async () => {
    await database.meta.bulkPut([
      { key: META_FILE_ID, value: found.fileId },
      { key: META_FILE_SHARED, value: found.ownedByMe === false }
    ]);
    await database.syncBaseline.delete('drive');
  });
}

/** Forget the file: its id and the baseline. Local data stays. */
export async function forgetRemote(database: HelloPollyDb): Promise<void> {
  await database.transaction('rw', database.meta, database.syncBaseline, async () => {
    await database.meta.bulkDelete([META_FILE_ID, META_FILE_SHARED]);
    await database.syncBaseline.delete('drive');
  });
}

/**
 * The family file's id: the stored one, else the oldest one on Drive, else a new one holding
 * the local copy (decision 64). Two fresh devices racing to create it both settle on the
 * oldest; the younger file is trashed.
 */
async function locate(backend: StorageBackend, database: HelloPollyDb, local: FamilyFile): Promise<{ id: string; created: boolean }> {
  const stored = await storedFileId(database);
  if (stored !== undefined) return { id: stored, created: false };

  let created = false;
  let found = await backend.find(FAMILY_FILE_NAME);
  if (found === null) {
    const mine = await backend.create(FAMILY_FILE_NAME, serializeFamily(local));
    created = true;
    found = (await backend.find(FAMILY_FILE_NAME)) ?? mine;
    if (found.fileId !== mine.fileId) {
      created = false;
      await backend.trash(mine.fileId).catch(() => undefined);
    }
  }
  await adopt(database, found);
  return { id: found.fileId, created };
}

async function cycle(deps: SyncDeps): Promise<SyncResult> {
  const { backend, database } = deps;
  const now = deps.now ?? (() => new Date());
  const device = await getDeviceId(database);
  const today = localDay(now());

  const local = await updateFamily((file) => tidyOwnProgress(file, device, today), database);
  const { id, created } = await locate(backend, database, local);

  let version: RemoteVersion;
  try {
    version = await backend.version(id);
  } catch (error) {
    if (error instanceof RemoteGoneError) {
      // Another parent's file: access was taken away. Nothing is re-created (decision 78).
      if (await isShared(database)) throw new AccessRevokedError();
      // This account's own: the local copy is the source of truth, so it is found or made again.
      await forgetRemote(database);
    }
    throw error;
  }
  if (version.ownedByMe !== undefined && (version.ownedByMe === false) !== (await isShared(database))) {
    await database.meta.put({ key: META_FILE_SHARED, value: version.ownedByMe === false });
  }

  const baseline = await getSyncBaseline(database);
  let remote: FamilyFile;
  let downloaded = false;
  if (baseline !== undefined && baseline.fileId === id && baseline.version === version.version) {
    remote = baseline.file;
  } else {
    const content = await backend.read(id);
    remote = parseFamilyFile(content.content);
    version = content.version;
    downloaded = true;
  }

  // Merged inside the same transaction as every local write, so nothing local is lost.
  const merged = await updateFamily((file) => mergeFamily(file, remote), database);

  let uploaded = false;
  let seen = remote;
  if (!same(merged, remote)) {
    version = await backend.update(serializeFamily(merged), version);
    seen = merged;
    uploaded = true;
  }
  await database.syncBaseline.put({
    id: 'drive',
    fileId: id,
    version: version.version,
    modifiedTime: version.modifiedTime,
    file: seen
  });
  return { version, downloaded, uploaded, created };
}

/**
 * One full sync. Losing the write guard re-runs the cycle (download, merge, upload); a file
 * that has gone is made again from the local copy, once.
 */
export async function syncOnce(deps: SyncDeps): Promise<SyncResult> {
  let recreated = false;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await cycle(deps);
    } catch (error) {
      if (error instanceof RemoteChangedError && attempt < MAX_ATTEMPTS) continue;
      if (error instanceof RemoteGoneError && !recreated) {
        recreated = true;
        continue;
      }
      throw error;
    }
  }
}

/** What joining a shared family would bring onto this device, for the join screen (decision 77). */
export interface JoinPreview {
  /** The shared family as it is on Drive. */
  remote: FamilyFile;
  /** This device's live children that the shared family does not have: „Dołącz” adds them. */
  localOnly: { id: string; name: string; avatar: string }[];
}

export async function previewJoin(deps: SyncDeps, fileId: string): Promise<JoinPreview> {
  const content = await deps.backend.read(fileId);
  const remote = parseFamilyFile(content.content);
  const local = await loadFamily(deps.database);
  const theirs = new Set(liveChildren(remote).map((c) => c.id));
  const localOnly = liveChildren(local)
    .filter((c) => !theirs.has(c.id))
    .map((c) => ({ id: c.id, name: c.profile.name, avatar: c.profile.avatar }));
  return { remote, localOnly };
}

/**
 * Make `fileId` (a family shared with this account, now reachable) this device's family:
 * adopt its id, merge this device's copy into it, upload. A family file of this account's own
 * that the device was syncing goes to the trash afterwards, so the parent's other devices
 * follow to the shared one (decision 77).
 */
export async function joinFamily(deps: SyncDeps, fileId: string): Promise<SyncResult> {
  const { backend, database } = deps;
  const { remote } = await previewJoin(deps, fileId);
  const previous = await storedFileId(database);
  const previousOwn = previous !== undefined && previous !== fileId && !(await isShared(database));

  const found = await backend.version(fileId);
  await updateFamily((file) => ({ ...file, familyId: remote.familyId }), database);
  await adopt(database, found);
  const result = await syncOnce(deps);
  if (previousOwn) await backend.trash(previous).catch(() => undefined);
  return result;
}

/** Whether this device holds anything the file (as last seen) lacks. */
export async function hasUnsyncedChanges(database: HelloPollyDb): Promise<boolean> {
  const [baseline, row] = await Promise.all([getSyncBaseline(database), database.family.get('local')]);
  if (row === undefined) return false;
  if (baseline === undefined) return true;
  return !same(mergeFamily(row.file, baseline.file), baseline.file);
}
