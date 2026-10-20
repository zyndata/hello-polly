import {
  NotAuthenticatedError,
  RemoteChangedError,
  RemoteGoneError,
  type AccountInfo,
  type Member,
  type PickResult,
  type RemoteContent,
  type RemoteVersion,
  type StorageBackend
} from './backend';
import { currentToken, forgetAccessToken, hasAccessToken, requestToken, revokeAccess, type TokenRequest } from './google-auth';
import { pickFile } from './picker';

/**
 * Google Drive, scope `drive.file`: the app sees only the files it created, or that the parent
 * picked for it in the Google Picker (a file the other parent shared, decision 77). The family file sits in the parent's visible Drive, so it
 * can be shared with the second parent; `appDataFolder` cannot (PLAN.md "Research summary").
 * It is created in an app-created `HelloPolly` folder (decision 74); `find` looks for it
 * anywhere the app can see, so a file that was moved or shared is still found.
 */

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_ABOUT = 'https://www.googleapis.com/drive/v3/about';

const VERSION_FIELDS = 'id,version,modifiedTime,ownedByMe';

export const FOLDER_NAME = 'HelloPolly';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

interface DriveFileResource {
  id?: string;
  version?: string;
  modifiedTime?: string;
  trashed?: boolean;
  ownedByMe?: boolean;
  createdTime?: string;
}

interface DrivePermission {
  id?: string;
  type?: string;
  role?: string;
  emailAddress?: string;
  displayName?: string;
}

const PERMISSION_FIELDS = 'id,type,role,emailAddress,displayName';

interface DriveErrorBody {
  error?: { message?: string; errors?: { reason?: string }[] };
}

/** 429 and 5xx are Google asking for a moment: two short retries, then give up until the next cycle. */
const RETRY_DELAYS_MS = [500, 1500];
const RETRY_AFTER_CAP_MS = 10_000;

export interface DriveBackendOptions {
  /** Injected in tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** The token for each request. Defaults to the one in hand, never asking Google (decision 66). */
  token?: () => Promise<string>;
  /** How a session is obtained in `authenticate`. Defaults to GIS, from a parent's tap. */
  requestToken?: (options: TokenRequest) => Promise<string>;
  /** Shows the file picker. Defaults to the Google Picker. */
  pickFile?: (fileId: string, accessToken: string) => Promise<PickResult>;
  /** Injected in tests, so the retries do not wait. */
  sleep?: (ms: number) => Promise<void>;
}

function toVersion(file: DriveFileResource): RemoteVersion | null {
  if (file.id === undefined || file.version === undefined || file.modifiedTime === undefined) return null;
  const found: RemoteVersion = { fileId: file.id, version: String(file.version), modifiedTime: file.modifiedTime };
  if (typeof file.ownedByMe === 'boolean') found.ownedByMe = file.ownedByMe;
  return found;
}

function toMember(permission: DrivePermission): Member | null {
  if (permission.type !== 'user' || permission.id === undefined || permission.emailAddress === undefined) return null;
  const member: Member = { id: permission.id, email: permission.emailAddress, role: permission.role === 'owner' ? 'owner' : 'writer' };
  if (permission.displayName !== undefined) member.name = permission.displayName;
  return member;
}

export function createDriveBackend(options: DriveBackendOptions = {}): StorageBackend {
  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const token = options.token ?? currentToken;
  const ask = options.requestToken ?? requestToken;
  const picker = options.pickFile ?? pickFile;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  function retryAfterMs(response: Response): number | undefined {
    const seconds = Number(response.headers.get('Retry-After') ?? NaN);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, RETRY_AFTER_CAP_MS) : undefined;
  }

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    for (let attempt = 0; ; attempt += 1) {
      const accessToken = await token();
      response = await doFetch(url, {
        ...init,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${accessToken}` }
      });
      const wait = RETRY_DELAYS_MS[attempt];
      if (wait === undefined || (response.status !== 429 && response.status < 500)) break;
      await sleep(retryAfterMs(response) ?? wait);
    }

    if (response.status === 401 || response.status === 403) {
      const body = (await response.clone().json().catch(() => ({}))) as DriveErrorBody;
      const reason = body.error?.errors?.[0]?.reason ?? '';
      if (response.status === 401 || reason === 'authError' || reason === 'insufficientPermissions') {
        forgetAccessToken();
        throw new NotAuthenticatedError(body.error?.message ?? 'Drive refused the request');
      }
      // `drive.file` no longer reaches this file (e.g. it was unshared): for us it is gone.
      if (reason === 'appNotAuthorizedToFile') throw new RemoteGoneError();
      throw new Error(`Drive request failed (${response.status}): ${body.error?.message ?? ''}`);
    }
    return response;
  }

  async function json<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await request(url, init);
    if (!response.ok) throw new Error(`Drive request failed (${response.status})`);
    return (await response.json()) as T;
  }

  const query = (params: Record<string, string>): string => new URLSearchParams(params).toString();

  /** The oldest app-created `HelloPolly` folder, created when there is none. */
  async function folderId(): Promise<string> {
    const found = await json<{ files?: DriveFileResource[] }>(
      `${DRIVE_FILES}?${query({
        spaces: 'drive',
        q: `name = '${FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
        orderBy: 'createdTime',
        fields: 'files(id)',
        pageSize: '1'
      })}`
    );
    const existing = found.files?.[0]?.id;
    if (existing !== undefined) return existing;
    const created = await json<DriveFileResource>(`${DRIVE_FILES}?${query({ fields: 'id' })}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME })
    });
    if (created.id === undefined) throw new Error('Drive created the folder but returned no id');
    return created.id;
  }

  async function version(fileId: string): Promise<RemoteVersion> {
    const response = await request(
      `${DRIVE_FILES}/${encodeURIComponent(fileId)}?${query({ fields: `${VERSION_FIELDS},trashed` })}`
    );
    if (response.status === 404) throw new RemoteGoneError();
    if (!response.ok) throw new Error(`Drive metadata read failed (${response.status})`);
    const file = (await response.json()) as DriveFileResource;
    const found = toVersion(file);
    if (file.trashed === true || found === null) throw new RemoteGoneError();
    return found;
  }

  async function signIn(request: TokenRequest): Promise<AccountInfo> {
    await ask(request);
    const about = await json<{ user?: { permissionId?: string; emailAddress?: string; displayName?: string } }>(
      `${DRIVE_ABOUT}?${query({ fields: 'user(permissionId,emailAddress,displayName)' })}`
    );
    const id = about.user?.permissionId;
    if (id === undefined) throw new NotAuthenticatedError('Drive did not identify the account');
    const label = about.user?.emailAddress ?? about.user?.displayName;
    return label === undefined ? { id } : { id, label };
  }

  return {
    authenticate: (authOptions = {}) => signIn({ interactive: authOptions.interactive === true }),

    switchAccount: () => signIn({ selectAccount: true }),

    isAuthenticated: hasAccessToken,

    signOut(): void {
      void revokeAccess();
    },

    async find(name: string): Promise<RemoteVersion | null> {
      const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const result = await json<{ files?: DriveFileResource[] }>(
        `${DRIVE_FILES}?${query({
          spaces: 'drive',
          q: `name = '${escaped}' and trashed = false`,
          orderBy: 'createdTime',
          fields: `files(${VERSION_FIELDS})`,
          pageSize: '10'
        })}`
      );
      // Oldest first; a file another parent shared wins over this account's own (decision 78).
      const found = (result.files ?? []).map(toVersion).filter((f): f is RemoteVersion => f !== null);
      return found.find((f) => f.ownedByMe === false) ?? found[0] ?? null;
    },

    async create(name: string, content: string): Promise<RemoteVersion> {
      const parent = await folderId();
      const boundary = `hp-${crypto.randomUUID()}`;
      const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify({ name, mimeType: 'application/json', parents: [parent] }),
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        content,
        `--${boundary}--`,
        ''
      ].join('\r\n');
      const file = await json<DriveFileResource>(
        `${DRIVE_UPLOAD}?${query({ uploadType: 'multipart', fields: VERSION_FIELDS })}`,
        { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }
      );
      const created = toVersion(file);
      if (created === null) throw new Error('Drive created the file but returned no version');
      return created;
    },

    version,

    async read(fileId: string): Promise<RemoteContent> {
      const current = await version(fileId);
      const response = await request(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?${query({ alt: 'media' })}`);
      if (response.status === 404) throw new RemoteGoneError();
      if (!response.ok) throw new Error(`Drive download failed (${response.status})`);
      return { content: await response.text(), version: current };
    },

    async update(content: string, expected: RemoteVersion): Promise<RemoteVersion> {
      // Drive has no conditional update: re-read the version just before writing (decision 65).
      const current = await version(expected.fileId);
      if (current.version !== expected.version) throw new RemoteChangedError();
      const file = await json<DriveFileResource>(
        `${DRIVE_UPLOAD}/${encodeURIComponent(expected.fileId)}?${query({ uploadType: 'media', fields: VERSION_FIELDS })}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: content }
      );
      const written = toVersion(file);
      if (written === null) throw new Error('Drive accepted the file but returned no version');
      return written;
    },

    async trash(fileId: string): Promise<void> {
      const response = await request(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?${query({ fields: 'id' })}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ trashed: true })
      });
      if (!response.ok && response.status !== 404) throw new Error(`Drive trash failed (${response.status})`);
    },

    async members(fileId: string): Promise<Member[]> {
      const response = await request(
        `${DRIVE_FILES}/${encodeURIComponent(fileId)}/permissions?${query({ fields: `permissions(${PERMISSION_FIELDS})`, pageSize: '100' })}`
      );
      if (response.status === 404) throw new RemoteGoneError();
      if (!response.ok) throw new Error(`Drive permissions read failed (${response.status})`);
      const body = (await response.json()) as { permissions?: DrivePermission[] };
      const members = (body.permissions ?? []).map(toMember).filter((m): m is Member => m !== null);
      return members.sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === 'owner' ? -1 : 1));
    },

    async share(fileId: string, email: string, message: string): Promise<Member> {
      const response = await request(
        `${DRIVE_FILES}/${encodeURIComponent(fileId)}/permissions?${query({
          sendNotificationEmail: 'true',
          emailMessage: message,
          fields: PERMISSION_FIELDS
        })}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email })
        }
      );
      if (response.status === 404) throw new RemoteGoneError();
      if (!response.ok) throw new Error(`Drive sharing failed (${response.status})`);
      const member = toMember((await response.json()) as DrivePermission);
      return member ?? { id: '', email, role: 'writer' };
    },

    async unshare(fileId: string, memberId: string): Promise<void> {
      const response = await request(`${DRIVE_FILES}/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(memberId)}`, {
        method: 'DELETE'
      });
      if (!response.ok && response.status !== 404) throw new Error(`Drive unsharing failed (${response.status})`);
    },

    async pick(fileId: string): Promise<PickResult> {
      return picker(fileId, await token());
    }
  };
}
