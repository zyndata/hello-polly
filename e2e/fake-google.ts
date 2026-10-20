import type { Browser, BrowserContext, Page, Route } from '@playwright/test';
import { fakeSpeech } from './speech';

/**
 * Google, faked at the network boundary (STATE.md decision 72, after Eat My Way's).
 *
 * Nothing in `src/` is stubbed: the app runs its real `google-auth.ts`, `drive.ts` and sync
 * engine over real `fetch` calls. Only what the test cannot own is replaced: the Google
 * Identity Services script, served from its real URL so the shipped CSP accepts it unchanged,
 * and the Drive REST API under `https://www.googleapis.com`.
 */

const GIS_URL = 'https://accounts.google.com/gsi/client';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** What the page-side GIS stub reads. Tests turn it with `setGoogleSession`. */
export interface GoogleSession {
  /** Signed in to Google in this browser at all. */
  signedIn: boolean;
  /** This app already holds a grant: what lets `prompt: ''` answer without a screen. */
  consented: boolean;
  /** The consent popup comes back empty, as if the parent closed it. */
  dismissPopup: boolean;
  /** The token the next successful request hands out. */
  token: string;
  /** Seconds, as GIS reports it. */
  expiresIn: number;
}

export const DEFAULT_SESSION: GoogleSession = {
  signedIn: true,
  consented: false,
  dismissPopup: false,
  token: 'e2e-token-1',
  expiresIn: 3600
};

interface StoredFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  content: string;
  version: number;
  created: number;
  trashed: boolean;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

interface FileMetadata {
  name?: string;
  mimeType?: string;
  parents?: string[];
}

export interface DriveRequest {
  method: string;
  /** Path plus query, the origin stripped. */
  url: string;
}

/**
 * An in-memory Drive behind the real REST surface. Like Drive it has no conditional write, so
 * the app's own guard (re-read the version, then upload) is what keeps it honest.
 *
 * `holdNextUpload` parks the next content upload until released: the window in which a test
 * lets another device's whole cycle land, to stage PLAN.md's upload race.
 */
export class FakeDrive {
  private readonly files = new Map<string, StoredFile>();
  private clock = 0;
  readonly requests: DriveRequest[] = [];
  readonly validTokens = new Set<string>([DEFAULT_SESSION.token]);
  /** How many times a page fetched the GIS script. Zero until a parent connects. */
  identityLoads = 0;
  account = { permissionId: 'perm-1', emailAddress: 'rodzic@example.com', displayName: 'Rodzic' };
  private hold: { arrived: () => void; released: Promise<void> } | null = null;

  private tick(): number {
    this.clock += 1;
    return this.clock;
  }

  private meta(file: StoredFile) {
    return {
      id: file.id,
      version: String(file.version),
      modifiedTime: new Date(Date.UTC(2026, 9, 19, 10, 0, file.version)).toISOString(),
      trashed: file.trashed
    };
  }

  private liveFiles(): StoredFile[] {
    return [...this.files.values()].filter((f) => !f.trashed && f.mimeType !== FOLDER_MIME);
  }

  /** The live family files' contents, parsed. */
  live(): unknown[] {
    return this.liveFiles().map((f) => JSON.parse(f.content) as unknown);
  }

  /** The folder names each live family file sits in (`[]` for the root of My Drive). */
  liveFolders(): string[][] {
    return this.liveFiles().map((f) => f.parents.map((id) => this.files.get(id)?.name ?? '?'));
  }

  /** The one live family file, parsed. */
  only<T = unknown>(): T {
    const live = this.live();
    if (live.length !== 1) throw new Error(`Expected one family file on Drive, found ${live.length}`);
    return live[0] as T;
  }

  revokeToken(token: string): void {
    this.validTokens.delete(token);
  }

  /** Park the next content upload. `arrived` resolves once it is parked; `release` lets it land. */
  holdNextUpload(): { arrived: Promise<void>; release: () => void } {
    let release!: () => void;
    let arrived!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const parked = new Promise<void>((resolve) => (arrived = resolve));
    this.hold = { arrived, released };
    return { arrived: parked, release };
  }

  async install(context: BrowserContext): Promise<void> {
    await context.route('https://www.googleapis.com/**', (route) => this.handle(route));
  }

  private static multipart(body: string): { metadata: FileMetadata; content: string } {
    const boundary = body.slice(2, body.indexOf('\r\n'));
    const parts = body
      .split(`--${boundary}`)
      .map((part) => part.replace(/^\r\n/, ''))
      .filter((part) => part.length > 0 && !part.startsWith('--'))
      .map((part) => part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
    const [metadata = '{}', content = ''] = parts;
    return { metadata: JSON.parse(metadata) as FileMetadata, content };
  }

  private add(metadata: FileMetadata, content: string): StoredFile {
    const at = this.tick();
    const file: StoredFile = {
      id: `file-${this.files.size + 1}`,
      name: metadata.name ?? '?',
      mimeType: metadata.mimeType ?? 'application/octet-stream',
      parents: metadata.parents ?? [],
      content,
      version: at,
      created: at,
      trashed: false
    };
    this.files.set(file.id, file);
    return file;
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    this.requests.push({ method, url: url.pathname + url.search });
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    const authorization = (await request.headerValue('authorization')) ?? '';
    if (!this.validTokens.has(authorization.replace(/^Bearer /, ''))) {
      await json({ error: { message: 'Invalid Credentials', errors: [{ reason: 'authError' }] } }, 401);
      return;
    }

    const path = url.pathname;
    if (path === '/drive/v3/about') return json({ user: this.account });

    if (path === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const name = q.match(/name = '((?:[^'\\]|\\.)*)'/)?.[1];
      const mimeType = q.match(/mimeType = '([^']*)'/)?.[1];
      const files = [...this.files.values()]
        .filter((f) => !f.trashed && (name === undefined || f.name === name) && (mimeType === undefined || f.mimeType === mimeType))
        .sort((a, b) => a.created - b.created)
        .map((f) => this.meta(f));
      return json({ files });
    }

    // Metadata-only create: the app uses it for its folder.
    if (path === '/drive/v3/files' && method === 'POST') {
      return json(this.meta(this.add(JSON.parse(request.postData() ?? '{}') as FileMetadata, '')));
    }

    if (path === '/upload/drive/v3/files' && method === 'POST') {
      const { metadata, content } = FakeDrive.multipart(request.postData() ?? '');
      return json(this.meta(this.add(metadata, content)));
    }

    const upload = path.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
    if (upload && method === 'PATCH') {
      const hold = this.hold;
      if (hold !== null) {
        this.hold = null;
        hold.arrived();
        await hold.released;
      }
      const file = this.files.get(decodeURIComponent(upload[1] as string));
      if (file === undefined || file.trashed) return json({ error: { message: 'File not found' } }, 404);
      file.content = request.postData() ?? '';
      file.version = this.tick();
      return json(this.meta(file));
    }

    const single = path.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (single) {
      const file = this.files.get(decodeURIComponent(single[1] as string));
      if (file === undefined) return json({ error: { message: 'File not found' } }, 404);
      if (method === 'PATCH') {
        const patch = JSON.parse(request.postData() ?? '{}') as { trashed?: boolean };
        if (patch.trashed === true) file.trashed = true;
        return json({ id: file.id });
      }
      if (url.searchParams.get('alt') === 'media') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: file.content });
      }
      return json(this.meta(file));
    }

    return json({ error: { message: `Unhandled ${method} ${path}` } }, 500);
  }
}

/** The GIS stub, run in the page. `__hpGoogle` is the dial; `prompts` records each request. */
const GIS_STUB = `
(function () {
  var state = window.__hpGoogle;
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: function (config) {
          state.clients.push({ client_id: config.client_id, scope: config.scope });
          return {
            requestAccessToken: function (overrides) {
              var prompt = (overrides && overrides.prompt) || '';
              state.prompts.push(prompt);
              state.hints.push((overrides && overrides.hint) || null);
              setTimeout(function () {
                function deny(type) {
                  if (config.error_callback) config.error_callback({ type: type, message: type });
                }
                if (prompt === 'consent') {
                  if (state.dismissPopup || !state.signedIn) return deny('popup_closed');
                  state.consented = true;
                  state.persist();
                } else if (!state.signedIn || !state.consented) {
                  return deny('popup_closed');
                }
                config.callback({ access_token: state.token, expires_in: state.expiresIn, scope: config.scope });
              }, 0);
            }
          };
        },
        revoke: function (token, done) {
          state.revoked.push(token);
          state.consented = false;
          state.persist();
          if (done) done();
        }
      }
    }
  };
})();
`;

/** Put the fake Google in front of a context. Contexts sharing one drive share one account. */
export async function installFakeGoogle(context: BrowserContext, drive: FakeDrive, session: Partial<GoogleSession> = {}): Promise<void> {
  await context.addInitScript(
    ([initial]) => {
      const KEY = '__hpGoogleSession';
      // A Google grant outlives a page load, so the fake's does too.
      const stored: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
      const state = {
        ...initial,
        ...(typeof stored === 'object' && stored !== null ? stored : {}),
        prompts: [] as string[],
        hints: [] as (string | null)[],
        clients: [] as { client_id: string; scope: string }[],
        revoked: [] as string[],
        persist(): void {
          const { signedIn, consented, dismissPopup, token, expiresIn } = state;
          window.localStorage.setItem(KEY, JSON.stringify({ signedIn, consented, dismissPopup, token, expiresIn }));
        }
      };
      Object.defineProperty(window, '__hpGoogle', { value: state, configurable: true });
    },
    [{ ...DEFAULT_SESSION, ...session }] as const
  );
  await context.route(GIS_URL, (route) => {
    drive.identityLoads += 1;
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: GIS_STUB });
  });
  await drive.install(context);
}

/** CSP violations, collected from the first byte (as `fixtures.ts` does for the default page). */
async function collectViolations(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
}

/** Another device: a fresh context (its own IndexedDB) over the same account. */
export async function openDevice(browser: Browser, drive: FakeDrive, baseURL: string): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  await collectViolations(context);
  await installFakeGoogle(context, drive);
  const page = await context.newPage();
  await fakeSpeech(page);
  return page;
}

export async function setGoogleSession(page: Page, patch: Partial<GoogleSession>): Promise<void> {
  await page.evaluate((update) => {
    const state = (window as unknown as { __hpGoogle: GoogleSession & { persist(): void } }).__hpGoogle;
    Object.assign(state, update);
    state.persist();
  }, patch);
}

/** What GIS was asked for on this page load: `''` is silent, `'consent'` the consent screen. */
export async function googlePrompts(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __hpGoogle: { prompts: string[] } }).__hpGoogle.prompts);
}

export async function googleScopes(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __hpGoogle: { clients: { scope: string }[] } }).__hpGoogle.clients.map((c) => c.scope));
}

export async function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? []);
}

/** Whether this build can connect at all (the CSP run needs a container built with a client id). */
export async function driveConfigured(page: Page): Promise<boolean> {
  return (await page.getByTestId('drive').getAttribute('data-status')) !== 'unconfigured';
}
