/**
 * The storage abstraction from PLAN.md "Architecture": the sync engine knows only this
 * interface, so a second backend never touches the merge rules. Shaped for one file found by
 * name and then addressed by id (STATE.md decision 65), plus sharing it with the second parent
 * (Phase 8, decisions 77–80).
 */

/** What `files.get(fields=id,version,modifiedTime)` says about the family file. */
export interface RemoteVersion {
  fileId: string;
  /** Drive's monotonic `version`, as a decimal string. Compared for equality only. */
  version: string;
  /** RFC 3339; shown to the parent, never used as a clock. */
  modifiedTime: string;
  /** `false` for a file another parent shared with this account (decision 78). */
  ownedByMe?: boolean;
}

export interface RemoteContent {
  content: string;
  version: RemoteVersion;
}

/** The connected account, as far as a `drive.file` grant can see it. */
export interface AccountInfo {
  /** Drive's stable per-account `permissionId`. */
  id: string;
  /** The e-mail (or name) for the parent panel; may be absent. */
  label?: string;
}

/** The grant is gone, or no token is in hand and none may be asked for right now. */
export class NotAuthenticatedError extends Error {
  constructor(message = 'The Drive connection needs to be renewed') {
    super(message);
    this.name = 'NotAuthenticatedError';
  }
}

/** The file moved between the version the merge was built on and the upload. */
export class RemoteChangedError extends Error {
  constructor() {
    super('The family file changed on Drive while it was being merged');
    this.name = 'RemoteChangedError';
  }
}

/** The file no longer exists for this account: deleted, trashed, or never visible to it. */
export class RemoteGoneError extends Error {
  constructor() {
    super('The family file is no longer on Drive');
    this.name = 'RemoteGoneError';
  }
}

/** Someone with access to the family file, as Drive lists it. */
export interface Member {
  /** Drive's permission id; for a person it equals their account's `permissionId`. */
  id: string;
  email: string;
  name?: string;
  role: 'owner' | 'writer';
}

/** What the parent did in the file picker. */
export type PickResult = 'picked' | 'cancelled';

export interface StorageBackend {
  /**
   * Obtain a session and say whose it is. `interactive: false` never opens a consent screen;
   * it throws `NotAuthenticatedError` when consent is needed.
   */
  authenticate(options?: { interactive?: boolean }): Promise<AccountInfo>;

  /**
   * Like `authenticate({ interactive: true })`, but lets the parent choose another Google
   * account (the join flow's „Zmień konto”, decision 80).
   */
  switchAccount(): Promise<AccountInfo>;

  /** Whether a token is in hand right now, without asking for one. */
  isAuthenticated(): boolean;

  /** Forget the session and give the grant back. Local data is never touched. */
  signOut(): void;

  /**
   * The app-visible, non-trashed file with this name, or `null`: one shared with this account
   * before one it owns, then the oldest (decision 78).
   */
  find(name: string): Promise<RemoteVersion | null>;

  create(name: string, content: string): Promise<RemoteVersion>;

  /** Throws `RemoteGoneError` when the file is gone. */
  version(fileId: string): Promise<RemoteVersion>;

  /** Throws `RemoteGoneError` when the file is gone. */
  read(fileId: string): Promise<RemoteContent>;

  /**
   * Replace the content. `expected` is the version the content was merged against; a
   * different current version raises `RemoteChangedError` instead of overwriting.
   */
  update(content: string, expected: RemoteVersion): Promise<RemoteVersion>;

  /**
   * Move a file this account owns to the trash: a duplicate (decision 64), or a parent's own
   * family file once it was merged into the shared one (decision 77).
   */
  trash(fileId: string): Promise<void>;

  /** Everyone with access, the owner first. Throws `RemoteGoneError` when the file is gone. */
  members(fileId: string): Promise<Member[]>;

  /** Give `email` write access; Drive e-mails them `message` (which carries the join link). */
  share(fileId: string, email: string, message: string): Promise<Member>;

  /** Take a member's access away. */
  unshare(fileId: string, memberId: string): Promise<void>;

  /**
   * Show the file picker filtered to this one file. Picking it is what gives this app access
   * to a file another parent shared (`drive.file`). Must follow a successful `authenticate`.
   */
  pick(fileId: string): Promise<PickResult>;
}
