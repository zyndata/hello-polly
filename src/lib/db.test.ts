import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  HelloPollyDb,
  getDeviceId,
  getPreferredVoices,
  getSyncBaseline,
  loadFamily,
  saveFamily,
  setPreferredVoice,
  setSyncBaseline,
  updateFamily
} from './db';
import { lww } from './domain/lww';
import { FAMILY_SCHEMA } from './types';

let n = 0;
const open: HelloPollyDb[] = [];
/** A fresh database per test, by name, so tests never share state. */
function fresh(name = `test-${n++}`): HelloPollyDb {
  const database = new HelloPollyDb(name);
  open.push(database);
  return database;
}

afterEach(() => {
  for (const database of open.splice(0)) database.close();
});

describe('local database', () => {
  it('creates a device id once and keeps it', async () => {
    const database = fresh();
    const id = await getDeviceId(database);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await getDeviceId(database)).toBe(id);
    expect((await database.meta.get('schema'))?.value).toBe(FAMILY_SCHEMA);
  });

  it('two concurrent first calls agree on one device id', async () => {
    const database = fresh();
    const [a, b] = await Promise.all([getDeviceId(database), getDeviceId(database)]);
    expect(a).toBe(b);
  });

  it('survives closing and reopening', async () => {
    const name = `test-${n++}`;
    const first = fresh(name);
    const id = await getDeviceId(first);
    const family = await loadFamily(first);
    first.close();
    const again = fresh(name);
    expect(await getDeviceId(again)).toBe(id);
    expect((await loadFamily(again)).familyId).toBe(family.familyId);
  });

  it('creates an empty family file on first load', async () => {
    const family = await loadFamily(fresh());
    expect(family.schema).toBe(FAMILY_SCHEMA);
    expect(family.children).toEqual({});
    expect(family.settings.accent.v).toBe('en-GB');
  });

  it('saves and updates the family file', async () => {
    const database = fresh();
    const family = await loadFamily(database);
    family.children['c1'] = lww({ name: 'Ola', avatar: 'cat' }, '2026-10-18T10:00:00.000Z', 'dev-a');
    await saveFamily(family, database);
    const updated = await updateFamily((f) => ({ ...f, contentVersion: f.contentVersion + 1 }), database);
    expect(updated.contentVersion).toBe(family.contentVersion + 1);
    const loaded = await loadFamily(database);
    expect(loaded.children['c1']?.v.name).toBe('Ola');
    expect(loaded.contentVersion).toBe(updated.contentVersion);
  });

  it('serialises concurrent updates, so no write is lost', async () => {
    const database = fresh();
    await loadFamily(database);
    await Promise.all(
      Array.from({ length: 10 }, () => updateFamily((f) => ({ ...f, contentVersion: f.contentVersion + 1 }), database))
    );
    expect((await loadFamily(database)).contentVersion).toBe(11);
  });

  it('stores the sync baseline', async () => {
    const database = fresh();
    expect(await getSyncBaseline(database)).toBeUndefined();
    const file = await loadFamily(database);
    await setSyncBaseline({ id: 'drive', fileId: 'abc', version: '7', modifiedTime: '2026-10-18T10:00:00.000Z', file }, database);
    expect((await getSyncBaseline(database))?.version).toBe('7');
  });

  it('keeps the preferred voice per language tag, locally', async () => {
    const database = fresh();
    expect(await getPreferredVoices(database)).toEqual({});
    await setPreferredVoice('en-GB', 'Daniel', database);
    await setPreferredVoice('pl-PL', 'Zosia', database);
    expect(await getPreferredVoices(database)).toEqual({ 'en-GB': 'Daniel', 'pl-PL': 'Zosia' });
    expect(await setPreferredVoice('en-GB', null, database)).toEqual({ 'pl-PL': 'Zosia' });
    // Never part of the synced family file.
    expect(JSON.stringify(await loadFamily(database))).not.toContain('Zosia');
  });
});
