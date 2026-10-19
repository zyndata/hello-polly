/**
 * The app's sync controller: connection state for *Rodzina* and the gear's dot, the triggers
 * from PLAN.md "Sync model" (≈ 5 s after a change, on focus, on `online`, every 3 minutes
 * while visible), and the parent's actions (connect, renew, disconnect).
 *
 * The child never sees sync (STATE.md decisions 66, 67): background cycles run only while a
 * token is in hand, and stop quietly otherwise; Google is asked for a token only from a
 * parent's tap.
 */

import { db, type HelloPollyDb } from '../db';
import { onLocalChange } from '../store';
import { NotAuthenticatedError, type StorageBackend } from './backend';
import { createDriveBackend } from './drive';
import { InvalidRemoteError, META_ACCOUNT, META_FILE_ID, NewerSchemaError, forgetRemote, hasUnsyncedChanges, syncOnce } from './engine';
import { isDriveConfigured, setAccountHint } from './google-auth';

/**
 * - `unconfigured`: this build has no OAuth client id.
 * - `off`: never connected, or disconnected.
 * - `paused`: connected, but no token in hand; waits for a parent's tap.
 * - `syncing`, `ok`, `error`: what the last cycle did.
 */
export type SyncStatus = 'unconfigured' | 'off' | 'paused' | 'syncing' | 'ok' | 'error';

export const META_ACCOUNT_ID = 'driveAccountId';
export const META_LAST_SYNC = 'driveLastSync';

export const DEBOUNCE_MS = 5_000;
export const INTERVAL_MS = 3 * 60_000;

interface State {
  status: SyncStatus;
  /** The account's e-mail, for the parent. */
  account: string | undefined;
  /** ISO time of the last successful cycle on this device. */
  lastSync: string | undefined;
  /** Polish, for *Rodzina*, when `status` is `error` (or why it is `paused`). */
  message: string | undefined;
  /** This device has changes Drive lacks. */
  unsynced: boolean;
}

const state = $state<State>({ status: 'off', account: undefined, lastSync: undefined, message: undefined, unsynced: false });

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
  get connected(): boolean {
    return state.status !== 'off' && state.status !== 'unconfigured';
  },
  /** The gear's dot (decision 67): progress waits and sync cannot run without a parent. */
  get attention(): boolean {
    return state.unsynced && (state.status === 'paused' || state.status === 'error');
  }
};

let backend: StorageBackend | undefined;
let database: HelloPollyDb | undefined;
let running: Promise<void> | null = null;
let again = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let started = false;

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

function pause(): void {
  state.status = 'paused';
  state.message = PAUSED_MESSAGE;
}

async function cycle(): Promise<void> {
  if (!syncState.connected) return;
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
  const [fileId, account, lastSync] = await Promise.all([
    metaString(META_FILE_ID),
    metaString(META_ACCOUNT),
    metaString(META_LAST_SYNC)
  ]);
  state.account = account;
  state.lastSync = lastSync;
  setAccountHint(account);
  // Connected means an account was linked; the file id may be re-found on the next cycle.
  const linked = (await metaString(META_ACCOUNT_ID)) !== undefined || fileId !== undefined;
  state.status = linked ? (be().isAuthenticated() ? 'ok' : 'paused') : 'off';
  if (state.status === 'paused') state.message = PAUSED_MESSAGE;

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
  if (linked) await syncNow();
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
  setAccountHint(label);
}

/**
 * „Połącz z Dyskiem Google” (a parent's click): the consent screen, then the first cycle,
 * which finds the family file or creates it. Throws when the parent closed the window.
 */
export async function connect(): Promise<void> {
  const account = await be().authenticate({ interactive: true });
  await link(account.id, account.label);
  state.status = 'ok';
  await syncNow();
}

/**
 * Renew without the consent screen, from a parent's tap (the gate, „Wznów”). Quietly does
 * nothing when not connected or a token is in hand; returns whether a token is in hand after.
 */
export async function renew(options: { interactive?: boolean } = {}): Promise<boolean> {
  if (!syncState.connected) return false;
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
  await store().meta.bulkDelete([META_ACCOUNT_ID, META_ACCOUNT, META_LAST_SYNC]);
  setAccountHint(undefined);
  Object.assign(state, { status: 'off', account: undefined, lastSync: undefined, message: undefined });
  await refreshUnsynced();
}
