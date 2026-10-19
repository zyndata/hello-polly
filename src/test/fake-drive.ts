/**
 * An in-memory Drive for the sync engine's unit tests (PLAN.md Phase 7 task 5). Several
 * backends over one `FakeDrive` are several devices signed in to one Google account.
 *
 * Like the real Drive it has no conditional write: `update` re-reads the version (the guard in
 * `drive.ts`) and then writes unconditionally. `beforeUpdate` runs before the guard (a change
 * there is caught and re-merged); `beforeWrite` runs between the guard and the write, which is
 * where a test interleaves another device's whole cycle to stage the race PLAN.md accepts: an
 * upload that drops the other device's latest delta from the file. The hooks are read on every
 * call, so a test may set them on the options object at any time.
 */

import {
  NotAuthenticatedError,
  RemoteChangedError,
  RemoteGoneError,
  type AccountInfo,
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
}

export class FakeDrive {
  readonly files = new Map<string, StoredFile>();
  private clock = 0;
  /** Every call that reached "Drive", for asserting on traffic. */
  readonly calls: string[] = [];

  private tick(): number {
    this.clock += 1;
    return this.clock;
  }

  versionOf(file: StoredFile): RemoteVersion {
    return { fileId: file.id, version: String(file.version), modifiedTime: `2026-10-19T00:00:${String(file.version).padStart(2, '0')}Z` };
  }

  add(name: string, content: string): StoredFile {
    const at = this.tick();
    const file: StoredFile = { id: `file-${this.files.size + 1}`, name, content, version: at, created: at, trashed: false };
    this.files.set(file.id, file);
    return file;
  }

  live(id: string): StoredFile {
    const file = this.files.get(id);
    if (file === undefined || file.trashed) throw new RemoteGoneError();
    return file;
  }

  write(id: string, content: string): StoredFile {
    const file = this.live(id);
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
}

export function fakeBackend(drive: FakeDrive, options: FakeBackendOptions = {}): StorageBackend {
  const account = options.account ?? { id: 'account-1', label: 'rodzic@example.com' };
  const auth = options.authenticated ?? { value: true };

  async function guard(call: string): Promise<void> {
    drive.calls.push(call);
    if (!auth.value) throw new NotAuthenticatedError();
  }

  return {
    async authenticate(): Promise<AccountInfo> {
      await guard('about');
      return account;
    },
    isAuthenticated: () => auth.value,
    signOut: () => {
      auth.value = false;
    },

    async find(name: string): Promise<RemoteVersion | null> {
      await guard('find');
      const oldest = [...drive.files.values()].filter((f) => f.name === name && !f.trashed).sort((a, b) => a.created - b.created)[0];
      return oldest === undefined ? null : drive.versionOf(oldest);
    },

    async create(name: string, content: string): Promise<RemoteVersion> {
      await options.beforeCreate?.();
      await guard('create');
      return drive.versionOf(drive.add(name, content));
    },

    async version(fileId: string): Promise<RemoteVersion> {
      await guard('version');
      return drive.versionOf(drive.live(fileId));
    },

    async read(fileId: string): Promise<RemoteContent> {
      await guard('read');
      const file = drive.live(fileId);
      return { content: file.content, version: drive.versionOf(file) };
    },

    async update(content: string, expected: RemoteVersion): Promise<RemoteVersion> {
      await options.beforeUpdate?.();
      await guard('update');
      if (String(drive.live(expected.fileId).version) !== expected.version) throw new RemoteChangedError();
      await options.beforeWrite?.();
      return drive.versionOf(drive.write(expected.fileId, content));
    },

    async trash(fileId: string): Promise<void> {
      await guard('trash');
      const file = drive.files.get(fileId);
      if (file !== undefined) file.trashed = true;
    }
  };
}
