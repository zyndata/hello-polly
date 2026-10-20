/**
 * The app's sync controller: connection state for *Rodzina* and the gear's dot, the triggers
 * from PLAN.md "Sync model" (≈ 5 s after a change, on focus, on `online`, every 3 minutes
 * while visible), and the parent's actions (connect, renew, disconnect).
 *
 * The child never sees sync (STATE.md decisions 66, 67): background cycles run only while a
 * token is in hand, and stop quietly otherwise; Google is asked for a token only from a
 * parent's tap.
 *
 * Phase 8 adds the second parent: joining a shared family (`/join/:fileId`, decision 77), the
 * members of the file (decision 79), and the `revoked` state when access is taken away
 * (decision 78).
 */

import { db, type HelloPollyDb } from '../db';
import { onLocalChange } from '../store';
import { NotAuthenticatedError, RemoteGoneError, type AccountInfo, type Member, type PickResult, type StorageBackend } from './backend';
import { createDriveBackend } from './drive';
import {
  AccessRevokedError,
  InvalidRemoteError,
  META_ACCOUNT,
  META_FILE_ID,
  META_FILE_SHARED,
  NewerSchemaError,
  forgetRemote,
  hasUnsyncedChanges,
  joinFamily,
  previewJoin,
  syncOnce,
  type JoinPreview
} from './engine';
import { forgetAccessToken, isDriveConfigured, setAccountHint } from './google-auth';

/**
 * - `unconfigured`: this build has no OAuth client id.
 * - `off`: never connected, or disconnected.
 * - `paused`: connected, but no token in hand; waits for a parent's tap.
 * - `syncing`, `ok`, `error`: what the last cycle did.
 * - `revoked`: the shared family is no longer reachable; sync has stopped until a parent acts.
 */
export type SyncStatus = 'unconfigured' | 'off' | 'paused' | 'syncing' | 'ok' | 'error' | 'revoked';

export const META_ACCOUNT_ID = 'driveAccountId';
export const META_LAST_SYNC = 'driveLastSync';
/** Kept, so that a reload of a device whose access was taken away asks Drive nothing. */
export const META_REVOKED = 'driveRevoked';

export const DEBOUNCE_MS = 5_000;
export const INTERVAL_MS = 3 * 60_000;

interface State {
  status: SyncStatus;
  /** The account's e-mail, for the parent. */
  account: string | undefined;
  /** ISO time of the last successful cycle on this device. */
  lastSync: string | undefined;
  /** Polish, for *Rodzina*, when `status` is `error` (or why it is `paused` or `revoked`). */
  message: string | undefined;
  /** This device has changes Drive lacks. */
  unsynced: boolean;
  /** The connected account's Drive `permissionId`, to mark „ty” among the members. */
  accountId: string | undefined;
  /** The family file is another parent's, shared with this account. */
  shared: boolean;
}

const state = $state<State>({
  status: 'off',
  account: undefined,
  lastSync: undefined,
  message: undefined,
  unsynced: false,
  accountId: undefined,
  shared: false
});

/** Read-only view for screens. */
export const syncState = {
  get status(): SyncStatus {
    return state.status;
  },
  get account(): string | undefined {
    return state.account;
  },
  get lastSync(): string | undefined {
    return state.lastSync;
  },
  get message(): string | undefined {
    return state.message;
  },
  get unsynced(): boolean {
    return state.unsynced;
  },
  get accountId(): string | undefined {
    return state.accountId;
  },
  get shared(): boolean {
    return state.shared;
  },
  get connected(): boolean {
    return state.status !== 'off' && state.status !== 'unconfigured';
  },
  /** The gear's dot (decision 67): progress waits and sync cannot run without a parent. */
  get attention(): boolean {
    return state.unsynced && (state.status === 'paused' || state.status === 'error' || state.status === 'revoked');
  }
};

let backend: StorageBackend | undefined;
let database: HelloPollyDb | undefined;
let running: Promise<void> | null = null;
let again = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let started = false;
/** A join is replacing the file under the cycle: background cycles wait it out. */
let joining = false;

const be = (): StorageBackend => (backend ??= createDriveBackend());
const store = (): HelloPollyDb => (database ??= db());

/** Tests swap the backend and the database. */
export function configureSync(options: { backend?: StorageBackend; database?: HelloPollyDb }): void {
  backend = options.backend;
  database = options.database;
}

async function metaString(key: string): Promise<string | undefined> {
  const row = await store().meta.get(key);
  return typeof row?.value === 'string' ? row.value : undefined;
}

async function refreshUnsynced(): Promise<void> {
  state.unsynced = await hasUnsyncedChanges(store());
}

async function refreshShared(): Promise<void> {
  state.shared = (await store().meta.get(META_FILE_SHARED))?.value === true;
}

function messageFor(error: unknown): string {
  if (error instanceof NewerSchemaError) {
    return 'Plik na Dysku zapisała nowsza wersja Hello Polly. Odśwież aplikację, żeby ją zaktualizować; do tego czasu plik nie jest zmieniany.';
  }
  if (error instanceof InvalidRemoteError) {
    return 'Plik hello-polly-family.json na Dysku nie wygląda na plik Hello Polly. Synchronizacja jest wstrzymana, a plik pozostał nietknięty.';
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Brak internetu. Postępy czekają na tym urządzeniu i zapiszą się same po połączeniu.';
  }
  return 'Nie udało się połączyć z Dyskiem Google. Spróbujemy ponownie za chwilę.';
}

const PAUSED_MESSAGE = 'Połączenie z Google wygasło. Postępy czekają na tym urządzeniu; dotknij „Wznów”, żeby je zapisać.';

const REVOKED_MESSAGE =
  'Dostęp do wspólnej rodziny został cofnięty: drugi rodzic usunął cię z rodziny albo usunął jej plik. Dzieci i postępy zostały na tym urządzeniu, ale przestały się synchronizować.';

function pause(): void {
  state.status = 'paused';
  state.message = PAUSED_MESSAGE;
}

async function revoke(): Promise<void> {
  state.status = 'revoked';
  state.message = REVOKED_MESSAGE;
  await store().meta.put({ key: META_REVOKED, value: true });
}

async function cycle(): Promise<void> {
  if (!syncState.connected || state.status === 'revoked' || joining) return;
  if (!be().isAuthenticated()) {
    pause();
    await refreshUnsynced();
    return;
  }
  state.status = 'syncing';
  try {
    await syncOnce({ backend: be(), database: store() });
    const now = new Date().toISOString();
    await store().meta.put({ key: META_LAST_SYNC, value: now });
    state.lastSync = now;
    state.status = 'ok';
    state.message = undefined;
  } catch (error) {
    if (error instanceof NotAuthenticatedError) pause();
    else if (error instanceof AccessRevokedError) await revoke();
    else {
      state.status = 'error';
      state.message = messageFor(error);
    }
  }
  await refreshUnsynced();
}

/**
 * Run a cycle now, or once more after the running one. Makes no Google request unless
 * connected with a token in hand.
 */
export function syncNow(): Promise<void> {
  if (running !== null) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await cycle();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

/** After a local change: a cycle in ≈ 5 s, so a burst of taps becomes one upload. */
export function syncSoon(): void {
  if (!syncState.connected) return;
  state.unsynced = true;
  clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), DEBOUNCE_MS);
}

/** Reads the stored connection; installs the triggers once. No Google request. */
export async function startSync(): Promise<void> {
  if (!isDriveConfigured()) {
    state.status = 'unconfigured';
    return;
  }
  const [fileId, account, lastSync, accountId, revoked] = await Promise.all([
    metaString(META_FILE_ID),
    metaString(META_ACCOUNT),
    metaString(META_LAST_SYNC),
    metaString(META_ACCOUNT_ID),
    store().meta.get(META_REVOKED)
  ]);
  state.account = account;
  state.lastSync = lastSync;
  state.accountId = accountId;
  await refreshShared();
  setAccountHint(account);
  // Connected means an account was linked; the file id may be re-found on the next cycle.
  const linked = accountId !== undefined || fileId !== undefined;
  state.status = linked ? (be().isAuthenticated() ? 'ok' : 'paused') : 'off';
  if (state.status === 'paused') state.message = PAUSED_MESSAGE;
  if (linked && revoked?.value === true) {
    state.status = 'revoked';
    state.message = REVOKED_MESSAGE;
  }

  if (!started && typeof window !== 'undefined') {
    started = true;
    onLocalChange(syncSoon);
    const visible = () => document.visibilityState === 'visible';
    window.addEventListener('focus', () => void syncNow());
    window.addEventListener('online', () => void syncNow());
    document.addEventListener('visibilitychange', () => {
      if (visible()) void syncNow();
    });
    setInterval(() => {
      if (visible()) void syncNow();
    }, INTERVAL_MS);
  }
  if (linked && state.status !== 'revoked') await syncNow();
  else await refreshUnsynced();
}

/** Remember who is connected; a different account than before starts from its own file. */
async function link(id: string, label: string | undefined): Promise<void> {
  const previous = await metaString(META_ACCOUNT_ID);
  if (previous !== undefined && previous !== id) await forgetRemote(store());
  await store().meta.bulkPut([
    { key: META_ACCOUNT_ID, value: id },
    { key: META_ACCOUNT, value: label ?? '' }
  ]);
  state.account = label;
  state.accountId = id;
  setAccountHint(label);
}

/**
 * „Połącz z Dyskiem Google” (a parent's click): the consent screen, then the first cycle,
 * which finds the family file (a shared one first) or creates it. Throws when the parent
 * closed the window.
 */
export async function connect(): Promise<void> {
  const account = await be().authenticate({ interactive: true });
  await link(account.id, account.label);
  await store().meta.delete(META_REVOKED);
  state.status = 'ok';
  await syncNow();
  await refreshShared();
}

/**
 * Renew without the consent screen, from a parent's tap (the gate, „Wznów”). Quietly does
 * nothing when not connected or a token is in hand; returns whether a token is in hand after.
 */
export async function renew(options: { interactive?: boolean } = {}): Promise<boolean> {
  if (!syncState.connected || state.status === 'revoked') return false;
  if (be().isAuthenticated() && options.interactive !== true) return true;
  try {
    const account = await be().authenticate({ interactive: options.interactive === true });
    await link(account.id, account.label);
  } catch {
    pause();
    return false;
  }
  await syncNow();
  return true;
}

/** „Odłącz”: give the grant back and forget the file. Every child and all progress stay. */
export async function disconnect(): Promise<void> {
  be().signOut();
  await forgetRemote(store());
  await store().meta.bulkDelete([META_ACCOUNT_ID, META_ACCOUNT, META_LAST_SYNC, META_REVOKED]);
  setAccountHint(undefined);
  Object.assign(state, {
    status: 'off',
    account: undefined,
    accountId: undefined,
    shared: false,
    lastSync: undefined,
    message: undefined
  });
  await refreshUnsynced();
}

// --- The second parent (Phase 8) ------------------------------------------------------------

/** The link in the invitation: this app's own address, so it also works on localhost. */
export function joinLink(fileId: string): string {
  return `${location.origin}${location.pathname}#/join/${encodeURIComponent(fileId)}`;
}

/** The Polish note in Drive's invitation e-mail. Drive's own button opens the raw file; the link opens the app. */
export function inviteMessage(link: string): string {
  return (
    'Zapraszam cię do naszej wspólnej rodziny w Hello Polly: będziemy widzieć te same dzieci, ustawienia i postępy. ' +
    `Otwórz ten link na telefonie lub tablecie, na którym chcesz używać Hello Polly: ${link} ` +
    '(przycisk „Otwórz” od Dysku Google pokazuje tylko plik z danymi).'
  );
}

/** The family file's id on this device, if it has one. */
export const familyFileId = (): Promise<string | undefined> => metaString(META_FILE_ID);

/**
 * Runs `action` on the family file. `fromTap` (a parent's button) may renew silently first;
 * otherwise only a token in hand is used, and Google is never asked (decision 66).
 */
async function onFile<T>(action: (fileId: string) => Promise<T>, fromTap = true): Promise<T> {
  const fileId = await familyFileId();
  if (fileId === undefined) throw new RemoteGoneError();
  if (!be().isAuthenticated() && !(fromTap && (await renew()))) throw new NotAuthenticatedError();
  return action(fileId);
}

/** Everyone with access to the family file, live from Drive (decision 79). Never asks for a token. */
export const listMembers = (): Promise<Member[]> => onFile((id) => be().members(id), false);

/** „Zaproś”: write access for `email`, and Drive's e-mail carrying the join link. */
export const invite = (email: string): Promise<Member> => onFile((id) => be().share(id, email.trim(), inviteMessage(joinLink(id))));

/** „Usuń”: the owner takes a member's access away. Their devices stop, with a message. */
export const removeMember = (memberId: string): Promise<void> => onFile((id) => be().unshare(id, memberId));

/**
 * The join flow's sign-in (a parent's tap). The device is **not** connected by it: nothing is
 * linked or created until the shared file is in hand (decision 77).
 */
export async function signInToJoin(options: { switchAccount?: boolean } = {}): Promise<AccountInfo> {
  const account = options.switchAccount === true ? await be().switchAccount() : await be().authenticate({ interactive: true });
  // Another account than the one this device syncs: its token must not reach the old file.
  joining = state.accountId !== undefined && account.id !== state.accountId;
  return account;
}

/** The join screen was left without joining: the device's own connection resumes. */
export function abandonJoin(): void {
  if (!joining) return;
  joining = false;
  // The token in hand is the other account's; the next parent tap renews the linked one.
  forgetAccessToken();
}

/** Whether the signed-in account can already reach the file (picked before, or its own). */
export async function canReach(fileId: string): Promise<boolean> {
  try {
    await be().version(fileId);
    return true;
  } catch (error) {
    if (error instanceof RemoteGoneError) return false;
    throw error;
  }
}

export const pickToJoin = (fileId: string): Promise<PickResult> => be().pick(fileId);

export const previewShared = (fileId: string): Promise<JoinPreview> => previewJoin({ backend: be(), database: store() }, fileId);

/** „Dołącz”: this device now syncs the shared family, its own children merged in. */
export async function completeJoin(fileId: string, account: AccountInfo): Promise<void> {
  joining = true;
  try {
    await running?.catch(() => undefined);
    await link(account.id, account.label);
    await joinFamily({ backend: be(), database: store() }, fileId);
    await store().meta.delete(META_REVOKED);
    const now = new Date().toISOString();
    await store().meta.put({ key: META_LAST_SYNC, value: now });
    Object.assign(state, { status: 'ok', message: undefined, lastSync: now });
  } finally {
    joining = false;
  }
  await refreshShared();
  await refreshUnsynced();
}
