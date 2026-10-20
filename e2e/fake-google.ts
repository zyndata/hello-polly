import type { Browser, BrowserContext, Page, Route } from '@playwright/test';
import { fakeSpeech } from './speech';

/**
 * Google, faked at the network boundary (STATE.md decision 72, after Eat My Way's).
 *
 * Nothing in `src/` is stubbed: the app runs its real `google-auth.ts`, `drive.ts`, `picker.ts`
 * and sync engine over real `fetch` calls. Only what the test cannot own is replaced, each at
 * its real URL so the shipped CSP accepts it unchanged: the Google Identity Services script,
 * the Drive REST API under `https://www.googleapis.com`, the Picker's loader at
 * `https://apis.google.com/js/api.js`, and the Picker's frame on `https://docs.google.com`
 * (Phase 8, decision 82).
 */

const GIS_URL = 'https://accounts.google.com/gsi/client';
const PICKER_LOADER_URL = 'https://apis.google.com/js/api.js';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** What the page-side GIS stub reads. Tests turn it with `setGoogleSession`. */
export interface GoogleSession {
  /** Signed in to Google in this browser at all. */
  signedIn: boolean;
  /** This app already holds a grant: what lets `prompt: ''` answer without a screen. */
  consented: boolean;
  /** The consent popup comes back empty, as if the parent closed it. */
  dismissPopup: boolean;
  /** The token the next successful request hands out; it names the account (`FakeDrive.addAccount`). */
  token: string;
  /** The token the account chooser (`prompt: 'select_account'`) switches to, if any. */
  nextToken: string | null;
  /** Seconds, as GIS reports it. */
  expiresIn: number;
}

export const DEFAULT_SESSION: GoogleSession = {
  signedIn: true,
  consented: false,
  dismissPopup: false,
  token: 'e2e-token-1',
  nextToken: null,
  expiresIn: 3600
};

export interface FakeAccount {
  permissionId: string;
  emailAddress: string;
  displayName: string;
}

export const DEFAULT_ACCOUNT: FakeAccount = { permissionId: 'perm-1', emailAddress: 'rodzic@example.com', displayName: 'Rodzic' };

interface StoredFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  content: string;
  version: number;
  created: number;
  trashed: boolean;
  /** The owner's e-mail. */
  owner: string;
  /** E-mail → role: who Drive lets in. */
  permissions: Map<string, 'owner' | 'writer'>;
  /** E-mails of the accounts this app may reach the file for (`drive.file`: created or picked). */
  authorized: Set<string>;
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
  /** The account the request's token belongs to. */
  account: string;
}

/**
 * An in-memory Drive behind the real REST surface. Like Drive it has no conditional write, so
 * the app's own guard (re-read the version, then upload) is what keeps it honest.
 *
 * Accounts are told apart by their token. Access follows `drive.file`: an account reaches a
 * file only while it has a permission on it *and* the app is authorised for it (it created the
 * file, or picked it in the Picker).
 *
 * `holdNextUpload` parks the next content upload until released: the window in which a test
 * lets another device's whole cycle land, to stage PLAN.md's upload race.
 */
export class FakeDrive {
  private readonly files = new Map<string, StoredFile>();
  private clock = 0;
  readonly requests: DriveRequest[] = [];
  readonly validTokens = new Set<string>([DEFAULT_SESSION.token]);
  private readonly tokenAccounts = new Map<string, FakeAccount>();
  /** How many times a page fetched the GIS script. Zero until a parent connects. */
  identityLoads = 0;
  /** How many times a page fetched the Picker's loader. Zero until a parent joins. */
  pickerLoads = 0;
  /** Every invitation e-mail Drive would have sent. */
  readonly invitations: { fileId: string; email: string; message: string }[] = [];
  account: FakeAccount = DEFAULT_ACCOUNT;
  private hold: { arrived: () => void; released: Promise<void> } | null = null;

  private tick(): number {
    this.clock += 1;
    return this.clock;
  }

  /** Another Google account, reached with `token`. */
  addAccount(token: string, account: FakeAccount): void {
    this.validTokens.add(token);
    this.tokenAccounts.set(token, account);
  }

  accountFor(token: string): FakeAccount {
    return this.tokenAccounts.get(token) ?? this.account;
  }

  private permissionId(email: string): string {
    if (email === this.account.emailAddress) return this.account.permissionId;
    for (const account of this.tokenAccounts.values()) if (account.emailAddress === email) return account.permissionId;
    return `perm-${email}`;
  }

  private meta(file: StoredFile, who: FakeAccount) {
    return {
      id: file.id,
      version: String(file.version),
      modifiedTime: new Date(Date.UTC(2026, 9, 19, 10, 0, file.version)).toISOString(),
      trashed: file.trashed,
      ownedByMe: file.owner === who.emailAddress
    };
  }

  private canSee(file: StoredFile, who: FakeAccount): boolean {
    return !file.trashed && file.permissions.has(who.emailAddress) && file.authorized.has(who.emailAddress);
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

  /** The one live family file's id. */
  onlyId(): string {
    const live = this.liveFiles();
    if (live.length !== 1) throw new Error(`Expected one family file on Drive, found ${live.length}`);
    return (live[0] as StoredFile).id;
  }

  /** Who has access to a file, by e-mail. */
  membersOf(fileId: string): Record<string, string> {
    return Object.fromEntries(this.files.get(fileId)?.permissions ?? []);
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
    await context.route('https://docs.google.com/**', (route) => this.handlePicker(route));
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

  private add(metadata: FileMetadata, content: string, owner: FakeAccount): StoredFile {
    const at = this.tick();
    const file: StoredFile = {
      id: `file-${this.files.size + 1}`,
      name: metadata.name ?? '?',
      mimeType: metadata.mimeType ?? 'application/octet-stream',
      parents: metadata.parents ?? [],
      content,
      version: at,
      created: at,
      trashed: false,
      owner: owner.emailAddress,
      permissions: new Map([[owner.emailAddress, 'owner']]),
      authorized: new Set([owner.emailAddress])
    };
    this.files.set(file.id, file);
    return file;
  }

  private permission(file: StoredFile, email: string) {
    const role = file.permissions.get(email);
    return { id: this.permissionId(email), type: 'user', role, emailAddress: email };
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const notFound = () => json({ error: { message: 'File not found', errors: [{ reason: 'notFound' }] } }, 404);
    const forbidden = () => json({ error: { message: 'Insufficient permissions', errors: [{ reason: 'insufficientFilePermissions' }] } }, 403);

    const token = ((await request.headerValue('authorization')) ?? '').replace(/^Bearer /, '');
    const who = this.accountFor(token);
    this.requests.push({ method, url: url.pathname + url.search, account: who.emailAddress });
    if (!this.validTokens.has(token)) {
      await json({ error: { message: 'Invalid Credentials', errors: [{ reason: 'authError' }] } }, 401);
      return;
    }

    const path = url.pathname;
    if (path === '/drive/v3/about') return json({ user: who });

    if (path === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const name = q.match(/name = '((?:[^'\\]|\\.)*)'/)?.[1];
      const mimeType = q.match(/mimeType = '([^']*)'/)?.[1];
      const files = [...this.files.values()]
        .filter((f) => this.canSee(f, who) && (name === undefined || f.name === name) && (mimeType === undefined || f.mimeType === mimeType))
        .sort((a, b) => a.created - b.created)
        .map((f) => this.meta(f, who));
      return json({ files });
    }

    // Metadata-only create: the app uses it for its folder.
    if (path === '/drive/v3/files' && method === 'POST') {
      return json(this.meta(this.add(JSON.parse(request.postData() ?? '{}') as FileMetadata, '', who), who));
    }

    if (path === '/upload/drive/v3/files' && method === 'POST') {
      const { metadata, content } = FakeDrive.multipart(request.postData() ?? '');
      return json(this.meta(this.add(metadata, content, who), who));
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
      if (file === undefined || !this.canSee(file, who)) return notFound();
      file.content = request.postData() ?? '';
      file.version = this.tick();
      return json(this.meta(file, who));
    }

    const permissions = path.match(/^\/drive\/v3\/files\/([^/]+)\/permissions(?:\/([^/]+))?$/);
    if (permissions) {
      const file = this.files.get(decodeURIComponent(permissions[1] as string));
      if (file === undefined || !this.canSee(file, who)) return notFound();
      const memberId = permissions[2] === undefined ? undefined : decodeURIComponent(permissions[2]);
      if (method === 'GET' && memberId === undefined) {
        return json({ permissions: [...file.permissions.keys()].map((email) => this.permission(file, email)) });
      }
      if (method === 'POST' && memberId === undefined) {
        const { emailAddress = '', role = 'writer' } = JSON.parse(request.postData() ?? '{}') as { emailAddress?: string; role?: string };
        if (!emailAddress.includes('@')) return json({ error: { message: 'Invalid email', errors: [{ reason: 'invalid' }] } }, 400);
        if (!file.permissions.has(emailAddress)) file.permissions.set(emailAddress, role === 'owner' ? 'owner' : 'writer');
        if (url.searchParams.get('sendNotificationEmail') === 'true') {
          this.invitations.push({ fileId: file.id, email: emailAddress, message: url.searchParams.get('emailMessage') ?? '' });
        }
        return json(this.permission(file, emailAddress));
      }
      if (method === 'DELETE' && memberId !== undefined) {
        if (file.owner !== who.emailAddress) return forbidden();
        const email = [...file.permissions.keys()].find((e) => this.permissionId(e) === memberId);
        if (email === undefined) return notFound();
        file.permissions.delete(email);
        return route.fulfill({ status: 204, body: '' });
      }
    }

    const single = path.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (single) {
      const file = this.files.get(decodeURIComponent(single[1] as string));
      if (file === undefined || !this.canSee(file, who)) return notFound();
      if (method === 'PATCH') {
        const patch = JSON.parse(request.postData() ?? '{}') as { trashed?: boolean };
        if (patch.trashed === true) {
          if (file.owner !== who.emailAddress) return forbidden();
          file.trashed = true;
        }
        return json({ id: file.id });
      }
      if (url.searchParams.get('alt') === 'media') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: file.content });
      }
      return json(this.meta(file, who));
    }

    return json({ error: { message: `Unhandled ${method} ${path}` } }, 500);
  }

  /**
   * The Picker's own frame, as `docs.google.com` would serve it: the one file when the
   * signed-in account has a permission on it, „Wybierz” and „Anuluj”. Picking authorises the
   * app for that account, which is what the real Picker does under `drive.file`.
   */
  private async handlePicker(route: Route): Promise<void> {
    const url = new URL(route.request().url());
    if (url.pathname === '/picker/grant' && route.request().method() === 'POST') {
      const { token = '', file = '' } = JSON.parse(route.request().postData() ?? '{}') as { token?: string; file?: string };
      const who = this.accountFor(token);
      const target = this.files.get(file);
      if (target === undefined || target.trashed || !target.permissions.has(who.emailAddress)) {
        return route.fulfill({ status: 403, body: '' });
      }
      target.authorized.add(who.emailAddress);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (url.pathname !== '/picker') return route.fulfill({ status: 404, body: '' });

    const token = url.searchParams.get('oauth_token') ?? '';
    const fileId = url.searchParams.get('file') ?? '';
    const who = this.accountFor(token);
    const file = this.files.get(fileId);
    const visible = this.validTokens.has(token) && file !== undefined && !file.trashed && file.permissions.has(who.emailAddress);
    const list = visible
      ? `<button type="button" id="file" data-testid="picker-file">${file?.name ?? ''}</button>`
      : '<p data-testid="picker-empty">Brak plików</p>';
    const body = `<!doctype html><html lang="pl"><body>
<p>Google Picker (fake) · ${who.emailAddress}</p>
${list}
<button type="button" id="select" disabled>Wybierz</button>
<button type="button" id="cancel">Anuluj</button>
<script>
  var chosen = null;
  var file = document.getElementById('file');
  var select = document.getElementById('select');
  if (file) file.onclick = function () { chosen = ${JSON.stringify(fileId)}; select.disabled = false; };
  select.onclick = function () {
    fetch('/picker/grant', { method: 'POST', body: JSON.stringify({ token: ${JSON.stringify(token)}, file: chosen }) })
      .then(function () { parent.postMessage({ hpPicker: 'picked', id: chosen }, '*'); });
  };
  document.getElementById('cancel').onclick = function () { parent.postMessage({ hpPicker: 'cancel' }, '*'); };
</script></body></html>`;
    return route.fulfill({ status: 200, contentType: 'text/html', body });
  }
}

/** The GIS stub, run in the page. `__hpGoogle` is the dial; `prompts` records each request. */
const GIS_STUB = `
(function () {
  var state = window.__hpGoogle;
  window.google = window.google || {};
  window.google.accounts = {
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
              if (prompt !== '') {
                if (state.dismissPopup || !state.signedIn) return deny('popup_closed');
                if (prompt === 'select_account' && state.nextToken) {
                  state.token = state.nextToken;
                  state.nextToken = null;
                }
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
  };
})();
`;

/**
 * The Picker's loader stub: \`gapi.load('picker')\` and the \`google.picker\` builder. Showing
 * the Picker puts the fake \`docs.google.com\` frame over the page (so \`frame-src\` is exercised)
 * and answers the app's callback from the frame's message.
 */
const PICKER_STUB = `
(function () {
  window.gapi = { load: function (name, options) { setTimeout(function () { (options.callback || options)(); }, 0); } };
  window.google = window.google || {};
  function DocsView() { this.fileIds = ''; }
  DocsView.prototype.setFileIds = function (ids) { this.fileIds = ids; return this; };
  DocsView.prototype.setMode = function () { return this; };
  function Builder() { this.c = { views: [] }; }
  ['enableFeature', 'setAppId', 'setCallback', 'setDeveloperKey', 'setLocale', 'setOAuthToken', 'setOrigin', 'setTitle'].forEach(function (m) {
    Builder.prototype[m] = function (v) { this.c[m] = v; return this; };
  });
  Builder.prototype.addView = function (v) { this.c.views.push(v); return this; };
  Builder.prototype.build = function () {
    var c = this.c;
    var fileIds = c.views.map(function (v) { return v.fileIds; }).join(',');
    var frame = null;
    function onMessage(event) {
      if (event.origin !== 'https://docs.google.com' || !event.data || !event.data.hpPicker) return;
      if (event.data.hpPicker === 'picked') c.setCallback({ action: 'picked', docs: [{ id: event.data.id }] });
      else c.setCallback({ action: 'cancel' });
    }
    return {
      setVisible: function () {
        window.__hpGoogle.pickers.push({ developerKey: c.setDeveloperKey, appId: c.setAppId, fileIds: fileIds, origin: c.setOrigin });
        frame = document.createElement('iframe');
        frame.className = 'picker-dialog-frame';
        frame.title = 'Google Picker';
        frame.src = 'https://docs.google.com/picker?oauth_token=' + encodeURIComponent(c.setOAuthToken) + '&file=' + encodeURIComponent(fileIds);
        frame.style.cssText = 'position:fixed;inset:10%;width:80%;height:80%;z-index:1001;background:#fff';
        window.addEventListener('message', onMessage);
        document.body.append(frame);
        c.setCallback({ action: 'loaded' });
      },
      dispose: function () {
        window.removeEventListener('message', onMessage);
        if (frame) frame.remove();
      }
    };
  };
  window.google.picker = {
    PickerBuilder: Builder,
    DocsView: DocsView,
    ViewId: { DOCS: 'all' },
    DocsViewMode: { LIST: 'list' },
    Feature: { NAV_HIDDEN: 'navHidden' },
    Action: { PICKED: 'picked', CANCEL: 'cancel' }
  };
})();
`;

/** Put the fake Google in front of a context. Contexts sharing one drive share one Drive. */
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
        pickers: [] as { developerKey: string; appId: string; fileIds: string; origin: string }[],
        persist(): void {
          const { signedIn, consented, dismissPopup, token, nextToken, expiresIn } = state;
          window.localStorage.setItem(KEY, JSON.stringify({ signedIn, consented, dismissPopup, token, nextToken, expiresIn }));
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
  await context.route(PICKER_LOADER_URL, (route) => {
    drive.pickerLoads += 1;
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: PICKER_STUB });
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

/** Another device: a fresh context (its own IndexedDB). `session.token` picks its Google account. */
export async function openDevice(browser: Browser, drive: FakeDrive, baseURL: string, session: Partial<GoogleSession> = {}): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  await collectViolations(context);
  await installFakeGoogle(context, drive, session);
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

/** What each Picker on this page load was built with. */
export async function pickerBuilds(page: Page): Promise<{ developerKey: string; appId: string; fileIds: string; origin: string }[]> {
  return page.evaluate(() => (window as unknown as { __hpGoogle: { pickers: { developerKey: string; appId: string; fileIds: string; origin: string }[] } }).__hpGoogle.pickers);
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
