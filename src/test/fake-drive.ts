/**
 * An in-memory Drive for the sync engine's unit tests (PLAN.md Phase 7 task 5). Several
 * backends over one `FakeDrive` are several devices; backends with different `account`s are
 * different parents (Phase 8).
 *
 * Like the real Drive it has no conditional write: `update` re-reads the version (the guard in
 * `drive.ts`) and then writes unconditionally. `beforeUpdate` runs before the guard (a change
 * there is caught and re-merged); `beforeWrite` runs between the guard and the write, which is
 * where a test interleaves another device's whole cycle to stage the race PLAN.md accepts: an
 * upload that drops the other device's latest delta from the file. The hooks are read on every
 * call, so a test may set them on the options object at any time.
 *
 * Access follows `drive.file`: an account sees a file only while it has a permission on it
 * *and* the app is authorised for it (it created the file, or picked it).
 */

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
} from '../lib/sync/backend';

interface StoredFile {
  id: string;
  name: string;
  content: string;
  version: number;
  created: number;
  trashed: boolean;
  owner: string;
  /** Account id (or `email:<address>` for an address with no account here) → role. */
  permissions: Map<string, 'owner' | 'writer'>;
  /** Accounts the app may reach this file for (`drive.file`). */
  authorized: Set<string>;
}

export const DEFAULT_ACCOUNT: AccountInfo = { id: 'account-1', label: 'rodzic@example.com' };

export class FakeDrive {
  readonly files = new Map<string, StoredFile>();
  private clock = 0;
  /** Every call that reached "Drive", for asserting on traffic. */
  readonly calls: string[] = [];
  /** Known accounts by e-mail, so sharing with an address reaches that account. */
  readonly accounts = new Map<string, AccountInfo>([[DEFAULT_ACCOUNT.label as string, DEFAULT_ACCOUNT]]);
  /** Every invitation e-mail Drive would have sent. */
  readonly invitations: { fileId: string; email: string; message: string }[] = [];

  private tick(): number {
    this.clock += 1;
    return this.clock;
  }

  versionOf(file: StoredFile, account = DEFAULT_ACCOUNT.id): RemoteVersion {
    return {
      fileId: file.id,
      version: String(file.version),
      modifiedTime: `2026-10-19T00:00:${String(file.version).padStart(2, '0')}Z`,
      ownedByMe: file.owner === account
    };
  }

  add(name: string, content: string, owner = DEFAULT_ACCOUNT.id): StoredFile {
    const at = this.tick();
    const file: StoredFile = {
      id: `file-${this.files.size + 1}`,
      name,
      content,
      version: at,
      created: at,
      trashed: false,
      owner,
      permissions: new Map([[owner, 'owner']]),
      authorized: new Set([owner])
    };
    this.files.set(file.id, file);
    return file;
  }

  canSee(file: StoredFile, account: string): boolean {
    return !file.trashed && file.permissions.has(account) && file.authorized.has(account);
  }

  live(id: string, account = DEFAULT_ACCOUNT.id): StoredFile {
    const file = this.files.get(id);
    if (file === undefined || !this.canSee(file, account)) throw new RemoteGoneError();
    return file;
  }

  write(id: string, content: string, account = DEFAULT_ACCOUNT.id): StoredFile {
    const file = this.live(id, account);
    file.content = content;
    file.version = this.tick();
    return file;
  }

  /** The one live family file's content, parsed. */
  only(): unknown {
    const live = [...this.files.values()].filter((f) => !f.trashed);
    if (live.length !== 1) throw new Error(`Expected one live file, found ${live.length}`);
    return JSON.parse((live[0] as StoredFile).content) as unknown;
  }

  permissionKey(email: string): string {
    return this.accounts.get(email)?.id ?? `email:${email}`;
  }
}

export interface FakeBackendOptions {
  account?: AccountInfo;
  /** Runs before the write guard reads the version: a change here is caught by the guard. */
  beforeUpdate?: () => Promise<void>;
  /** Runs after the write guard passed and before the write lands: a change here is overwritten. */
  beforeWrite?: () => Promise<void>;
  /** Runs before `create`, so a test can let another device create a file first. */
  beforeCreate?: () => Promise<void>;
  /** Whether a token is in hand; `authenticate` and every request fail while false. */
  authenticated?: { value: boolean };
  /** What the parent does in the picker (default: picks the file when they can see it). */
  pick?: 'pick' | 'close';
  /** The account `switchAccount` changes to. */
  switchTo?: AccountInfo;
}

export function fakeBackend(drive: FakeDrive, options: FakeBackendOptions = {}): StorageBackend {
  let account = options.account ?? DEFAULT_ACCOUNT;
  if (account.label !== undefined && !drive.accounts.has(account.label)) drive.accounts.set(account.label, account);
  const auth = options.authenticated ?? { value: true };

  async function guard(call: string): Promise<void> {
    drive.calls.push(call);
    if (!auth.value) throw new NotAuthenticatedError();
  }

  const me = () => account.id;

  return {
    async authenticate(): Promise<AccountInfo> {
      await guard('about');
      return account;
    },
    async switchAccount(): Promise<AccountInfo> {
      await guard('about');
      if (options.switchTo !== undefined) {
        account = options.switchTo;
        if (account.label !== undefined) drive.accounts.set(account.label, account);
      }
      return account;
    },
    isAuthenticated: () => auth.value,
    signOut: () => {
      auth.value = false;
    },

    async find(name: string): Promise<RemoteVersion | null> {
      await guard('find');
      const visible = [...drive.files.values()]
        .filter((f) => f.name === name && drive.canSee(f, me()))
        .sort((a, b) => a.created - b.created);
      const chosen = visible.find((f) => f.owner !== me()) ?? visible[0];
      return chosen === undefined ? null : drive.versionOf(chosen, me());
    },

    async create(name: string, content: string): Promise<RemoteVersion> {
      await options.beforeCreate?.();
      await guard('create');
      return drive.versionOf(drive.add(name, content, me()), me());
    },

    async version(fileId: string): Promise<RemoteVersion> {
      await guard('version');
      return drive.versionOf(drive.live(fileId, me()), me());
    },

    async read(fileId: string): Promise<RemoteContent> {
      await guard('read');
      const file = drive.live(fileId, me());
      return { content: file.content, version: drive.versionOf(file, me()) };
    },

    async update(content: string, expected: RemoteVersion): Promise<RemoteVersion> {
      await options.beforeUpdate?.();
      await guard('update');
      if (String(drive.live(expected.fileId, me()).version) !== expected.version) throw new RemoteChangedError();
      await options.beforeWrite?.();
      return drive.versionOf(drive.write(expected.fileId, content, me()), me());
    },

    async trash(fileId: string): Promise<void> {
      await guard('trash');
      const file = drive.files.get(fileId);
      if (file === undefined) return;
      if (file.owner !== me()) throw new Error('Only the owner can trash a file');
      file.trashed = true;
    },

    async members(fileId: string): Promise<Member[]> {
      await guard('members');
      const file = drive.live(fileId, me());
      const emails = new Map([...drive.accounts.values()].map((a) => [a.id, a.label ?? a.id]));
      return [...file.permissions].map(([key, role]) => ({
        id: key,
        email: key.startsWith('email:') ? key.slice(6) : (emails.get(key) ?? key),
        role
      }));
    },

    async share(fileId: string, email: string, message: string): Promise<Member> {
      await guard('share');
      const file = drive.live(fileId, me());
      const key = drive.permissionKey(email);
      file.permissions.set(key, file.permissions.get(key) ?? 'writer');
      drive.invitations.push({ fileId, email, message });
      return { id: key, email, role: file.permissions.get(key) ?? 'writer' };
    },

    async unshare(fileId: string, memberId: string): Promise<void> {
      await guard('unshare');
      const file = drive.live(fileId, me());
      if (file.owner !== me()) throw new Error('Only the owner can remove a member');
      file.permissions.delete(memberId);
    },

    async pick(fileId: string): Promise<PickResult> {
      await guard('pick');
      const file = drive.files.get(fileId);
      if (options.pick === 'close' || file === undefined || file.trashed || !file.permissions.has(me())) return 'cancelled';
      file.authorized.add(me());
      return 'picked';
    }
  };
}
