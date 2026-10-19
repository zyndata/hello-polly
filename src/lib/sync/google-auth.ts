import { NotAuthenticatedError } from './backend';

/**
 * Google Identity Services, token flow (Eat My Way decisions 90 and 173, STATE.md decision 66).
 *
 * A static bundle has nowhere to keep a client secret, so GIS hands the page a one-hour access
 * token and there is no refresh token. The token is kept in memory and mirrored into
 * `sessionStorage`, so a reload keeps the session without asking Google again; never
 * `localStorage`, never IndexedDB, never Drive. Closing the tab ends it.
 *
 * Asking Google for a token (`requestToken`) may open a window, even with `prompt: ''`. So it
 * is only ever called from a parent's tap: the gate, or a button on *Rodzina*. Background sync
 * uses `currentToken`, which never loads GIS and fails when no token is in hand.
 */

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

/** Treat the token as expired this many seconds early, so a request never carries a dying one. */
const EXPIRY_MARGIN_SECONDS = 60;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; hint?: string }): void;
}

interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }): TokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

/** Whether this build carries an OAuth client id at all. */
export function isDriveConfigured(): boolean {
  return GOOGLE_CLIENT_ID.trim().length > 0;
}

let scriptPromise: Promise<GoogleIdentityServices> | null = null;

/** Loaded on demand: a device that never connects makes no request to Google. */
function loadGis(): Promise<GoogleIdentityServices> {
  scriptPromise ??= new Promise<GoogleIdentityServices>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve(window.google);
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new Error('Google Identity Services loaded without an OAuth client'));
    };
    script.onerror = () => {
      // A later tap retries from scratch: this one may simply have been offline.
      scriptPromise = null;
      reject(new Error('Google Identity Services could not be loaded'));
    };
    document.head.append(script);
  });
  return scriptPromise;
}

interface Token {
  value: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

const TOKEN_KEY = 'hp.driveToken';

/** Web storage throws in a browser with site data blocked; that only costs the reload. */
function session(): Storage | undefined {
  try {
    return (globalThis.sessionStorage as Storage | undefined) ?? undefined;
  } catch {
    return undefined;
  }
}

function persist(next: Token | null): void {
  try {
    if (next === null) session()?.removeItem(TOKEN_KEY);
    else session()?.setItem(TOKEN_KEY, JSON.stringify(next));
  } catch {
    // A full or blocked store costs this session its survival across a reload, nothing more.
  }
}

function restore(): Token | null {
  try {
    const raw = session()?.getItem(TOKEN_KEY);
    if (raw === undefined || raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { value, expiresAt } = parsed as { value?: unknown; expiresAt?: unknown };
    return typeof value === 'string' && typeof expiresAt === 'number' ? { value, expiresAt } : null;
  } catch {
    return null;
  }
}

let token: Token | null = restore();
/** The account a silent renewal should renew, from `meta` (never `localStorage`). */
let hint: string | undefined;
let client: TokenClient | null = null;
let pending: Promise<string> | null = null;
let settle: { resolve: (value: string) => void; reject: (error: Error) => void } | null = null;

const valid = (now: number): boolean => token !== null && token.expiresAt > now;

/** Whether a token is in hand right now. Never triggers a request. */
export function hasAccessToken(): boolean {
  return valid(Date.now());
}

/** The token in hand, for background requests. Never loads GIS, never opens anything. */
export function currentToken(): Promise<string> {
  if (token !== null && valid(Date.now())) return Promise.resolve(token.value);
  return Promise.reject(new NotAuthenticatedError('No Drive token in hand'));
}

export function forgetAccessToken(): void {
  token = null;
  persist(null);
}

export function setAccountHint(label: string | undefined): void {
  hint = label;
}

/** Drop the token and tell Google the grant is finished. */
export async function revokeAccess(): Promise<void> {
  const current = token?.value;
  forgetAccessToken();
  hint = undefined;
  if (current === undefined) return;
  const gis = await loadGis().catch(() => null);
  gis?.accounts.oauth2.revoke(current);
}

async function ensureClient(): Promise<TokenClient> {
  if (client !== null) return client;
  if (!isDriveConfigured()) throw new NotAuthenticatedError('This build has no Google OAuth client id');
  const gis = await loadGis();
  client = gis.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_FILE_SCOPE,
    callback: (response) => {
      const done = settle;
      settle = null;
      if (done === null) return;
      if (typeof response.access_token !== 'string' || response.error !== undefined) {
        done.reject(new NotAuthenticatedError(response.error_description ?? response.error ?? 'No token'));
        return;
      }
      const lifetime = Math.max((response.expires_in ?? 3600) - EXPIRY_MARGIN_SECONDS, 0);
      token = { value: response.access_token, expiresAt: Date.now() + lifetime * 1000 };
      persist(token);
      done.resolve(response.access_token);
    },
    error_callback: (error) => {
      const done = settle;
      settle = null;
      done?.reject(new NotAuthenticatedError(error.message ?? 'The Google sign-in was dismissed'));
    }
  });
  return client;
}

/**
 * Ask Google for a token. **Only from a parent's tap.** `interactive` shows the consent
 * screen (connecting); otherwise `prompt: ''` lets Google answer without one when the grant
 * stands, with the remembered account as the hint.
 */
export function requestToken(options: { interactive?: boolean } = {}): Promise<string> {
  const interactive = options.interactive === true;
  if (!interactive && token !== null && valid(Date.now())) return Promise.resolve(token.value);
  // Two callers share one window. A click waiting on a silent attempt that failed asks again
  // for itself, with the consent screen.
  if (pending !== null) return interactive ? pending.then((v) => v, () => requestToken(options)) : pending;

  const attempt = (async () => {
    const tokenClient = await ensureClient();
    return new Promise<string>((resolve, reject) => {
      settle = { resolve, reject };
      tokenClient.requestAccessToken({
        prompt: interactive ? 'consent' : '',
        ...(interactive || hint === undefined ? {} : { hint })
      });
    });
  })();
  pending = attempt;
  // Registered first, so it has run by the time any waiter's handler does.
  const clear = () => {
    if (pending === attempt) pending = null;
  };
  attempt.then(clear, clear);
  return attempt;
}
