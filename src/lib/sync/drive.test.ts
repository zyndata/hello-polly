import { describe, expect, it } from 'vitest';
import { NotAuthenticatedError, RemoteChangedError, RemoteGoneError } from './backend';
import { createDriveBackend } from './drive';

interface Call {
  method: string;
  url: URL;
  body: string;
  auth: string;
}

/** A scripted `fetch`: each handler answers one request, in order. */
function scripted(...answers: ((call: Call) => Response)[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      method: init?.method ?? 'GET',
      url: new URL(String(input)),
      body: typeof init?.body === 'string' ? init.body : '',
      auth: headers.get('Authorization') ?? ''
    };
    calls.push(call);
    const answer = answers.shift();
    if (answer === undefined) throw new Error(`Unexpected request ${call.method} ${call.url}`);
    return answer(call);
  }) as typeof fetch;
  const backend = createDriveBackend({
    fetchImpl,
    token: async () => 'tok',
    requestToken: async () => 'tok',
    sleep: async () => undefined
  });
  return { backend, calls };
}

const ok = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const status = (code: number, body: unknown = {}) => () => new Response(JSON.stringify(body), { status: code });
const meta = { id: 'f1', version: '7', modifiedTime: '2026-10-19T10:00:00.000Z' };

describe('Drive backend (drive.file)', () => {
  it('finds the family file by name in the visible Drive, oldest first, with the bearer token', async () => {
    const { backend, calls } = scripted(ok({ files: [meta] }));
    expect(await backend.find('hello-polly-family.json')).toEqual({ fileId: 'f1', version: '7', modifiedTime: meta.modifiedTime });
    const [call] = calls;
    expect(call?.url.searchParams.get('q')).toBe("name = 'hello-polly-family.json' and trashed = false");
    expect(call?.url.searchParams.get('spaces')).toBe('drive');
    expect(call?.url.searchParams.get('orderBy')).toBe('createdTime');
    expect(call?.auth).toBe('Bearer tok');
  });

  it('creates the file with a multipart upload inside an existing HelloPolly folder', async () => {
    const { backend, calls } = scripted(ok({ files: [{ id: 'dir1' }] }), ok(meta));
    await backend.create('hello-polly-family.json', '{"a":1}');
    const [lookup, upload] = calls;
    expect(lookup?.url.searchParams.get('q')).toBe(
      "name = 'HelloPolly' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    );
    expect(lookup?.url.searchParams.get('orderBy')).toBe('createdTime');
    expect(upload?.method).toBe('POST');
    expect(upload?.url.pathname).toBe('/upload/drive/v3/files');
    expect(upload?.body).toContain('{"name":"hello-polly-family.json","mimeType":"application/json","parents":["dir1"]}');
    expect(upload?.body).toContain('{"a":1}');
  });

  it('creates the HelloPolly folder first when there is none', async () => {
    const { backend, calls } = scripted(ok({ files: [] }), ok({ id: 'dir2' }), ok(meta));
    await backend.create('hello-polly-family.json', '{}');
    const folder = calls[1];
    expect(folder?.method).toBe('POST');
    expect(folder?.url.pathname).toBe('/drive/v3/files');
    expect(JSON.parse(folder?.body ?? '')).toEqual({ name: 'HelloPolly', mimeType: 'application/vnd.google-apps.folder' });
    expect(calls[2]?.body).toContain('"parents":["dir2"]');
  });

  it('updates only when the version is still the one merged against', async () => {
    const { backend, calls } = scripted(ok(meta), ok({ ...meta, version: '8' }));
    const written = await backend.update('{}', { fileId: 'f1', version: '7', modifiedTime: meta.modifiedTime });
    expect(written.version).toBe('8');
    expect(calls[1]?.method).toBe('PATCH');
    expect(calls[1]?.url.searchParams.get('uploadType')).toBe('media');

    const stale = scripted(ok({ ...meta, version: '9' }));
    await expect(stale.backend.update('{}', { fileId: 'f1', version: '7', modifiedTime: '' })).rejects.toBeInstanceOf(RemoteChangedError);
    expect(stale.calls).toHaveLength(1);
  });

  it('reports a missing or trashed file as gone', async () => {
    await expect(scripted(status(404)).backend.version('f1')).rejects.toBeInstanceOf(RemoteGoneError);
    await expect(scripted(ok({ ...meta, trashed: true })).backend.version('f1')).rejects.toBeInstanceOf(RemoteGoneError);
    const unauthorized = status(403, { error: { errors: [{ reason: 'appNotAuthorizedToFile' }] } });
    await expect(scripted(unauthorized).backend.version('f1')).rejects.toBeInstanceOf(RemoteGoneError);
  });

  it('turns 401 into NotAuthenticatedError, and a quota 403 into a plain error', async () => {
    await expect(scripted(status(401)).backend.version('f1')).rejects.toBeInstanceOf(NotAuthenticatedError);
    const quota = scripted(status(403, { error: { message: 'Rate', errors: [{ reason: 'userRateLimitExceeded' }] } }));
    const error = await quota.backend.version('f1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(NotAuthenticatedError);
  });

  it('retries 429 and 5xx twice, then gives up', async () => {
    const retried = scripted(status(503), status(429), ok(meta));
    expect((await retried.backend.version('f1')).version).toBe('7');
    expect(retried.calls).toHaveLength(3);
    const failing = scripted(status(500), status(500), status(500));
    await expect(failing.backend.version('f1')).rejects.toThrow();
    expect(failing.calls).toHaveLength(3);
  });

  it('reads the content with the version it belongs to', async () => {
    const { backend } = scripted(ok(meta), () => new Response('{"x":1}', { status: 200 }));
    expect(await backend.read('f1')).toEqual({ content: '{"x":1}', version: { fileId: 'f1', version: '7', modifiedTime: meta.modifiedTime } });
  });

  it('identifies the account with about.get', async () => {
    const { backend, calls } = scripted(ok({ user: { permissionId: 'p1', emailAddress: 'rodzic@example.com' } }));
    expect(await backend.authenticate()).toEqual({ id: 'p1', label: 'rodzic@example.com' });
    expect(calls[0]?.url.pathname).toBe('/drive/v3/about');
  });
});

describe('Drive backend: sharing (Phase 8)', () => {
  it('prefers a family file shared with the account over its own older one', async () => {
    const own = { ...meta, ownedByMe: true };
    const shared = { ...meta, id: 'f2', ownedByMe: false };
    const { backend, calls } = scripted(ok({ files: [own, shared] }));
    expect((await backend.find('hello-polly-family.json'))?.fileId).toBe('f2');
    expect(calls[0]?.url.searchParams.get('fields')).toContain('ownedByMe');
    const single = scripted(ok({ files: [own] }));
    expect(await single.backend.find('hello-polly-family.json')).toEqual({ fileId: 'f1', version: '7', modifiedTime: meta.modifiedTime, ownedByMe: true });
  });

  it('invites as a writer with Drive’s notification e-mail carrying the message', async () => {
    const { backend, calls } = scripted(ok({ id: 'p2', type: 'user', role: 'writer', emailAddress: 'b@example.com' }));
    expect(await backend.share('f1', 'b@example.com', 'Link: https://x/#/join/f1')).toEqual({ id: 'p2', email: 'b@example.com', role: 'writer' });
    const [call] = calls;
    expect(call?.method).toBe('POST');
    expect(call?.url.pathname).toBe('/drive/v3/files/f1/permissions');
    expect(call?.url.searchParams.get('sendNotificationEmail')).toBe('true');
    expect(call?.url.searchParams.get('emailMessage')).toBe('Link: https://x/#/join/f1');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ type: 'user', role: 'writer', emailAddress: 'b@example.com' });
  });

  it('lists the people with access, the owner first, leaving out anything that is not a user', async () => {
    const { backend } = scripted(
      ok({
        permissions: [
          { id: 'p2', type: 'user', role: 'writer', emailAddress: 'b@example.com' },
          { id: 'anyone', type: 'anyone', role: 'reader' },
          { id: 'p1', type: 'user', role: 'owner', emailAddress: 'a@example.com', displayName: 'Anna' }
        ]
      })
    );
    expect(await backend.members('f1')).toEqual([
      { id: 'p1', email: 'a@example.com', name: 'Anna', role: 'owner' },
      { id: 'p2', email: 'b@example.com', role: 'writer' }
    ]);
  });

  it('removes a member by permission id, and a member list of a file that is gone is RemoteGone', async () => {
    const { backend, calls } = scripted(() => new Response(null, { status: 204 }), status(404));
    await backend.unshare('f1', 'p2');
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.url.pathname).toBe('/drive/v3/files/f1/permissions/p2');
    await expect(backend.members('f1')).rejects.toBeInstanceOf(RemoteGoneError);
  });

  it('opens the picker with the token in hand, and switches account with the chooser', async () => {
    const asked: unknown[] = [];
    const picked: [string, string][] = [];
    const backend = createDriveBackend({
      fetchImpl: (async () => new Response(JSON.stringify({ user: { permissionId: 'p9', emailAddress: 'c@example.com' } }))) as typeof fetch,
      token: async () => 'tok',
      requestToken: async (request) => {
        asked.push(request);
        return 'tok';
      },
      pickFile: async (fileId, token) => {
        picked.push([fileId, token]);
        return 'picked';
      }
    });
    expect(await backend.pick('f1')).toBe('picked');
    expect(picked).toEqual([['f1', 'tok']]);
    expect(await backend.switchAccount()).toEqual({ id: 'p9', label: 'c@example.com' });
    expect(asked).toEqual([{ selectAccount: true }]);
  });
});
