import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { HelloPollyDb, getDeviceId, getSyncBaseline, loadFamily, updateFamily } from '../db';
import { addChild, deleteChild, liveChildren } from '../domain/children';
import { gen } from '../domain/arbitrary';
import { readSettings, setSetting } from '../domain/family';
import { canonicalJson } from '../domain/lww';
import { addStars, recordAttempt, recordChest, recordIntroduced } from '../domain/progress';
import { album, chestState, totalStars } from '../domain/rewards';
import { wordStates } from '../domain/learning';
import type { DeviceId, FamilyFile, Instant } from '../types';
import { FakeDrive, fakeBackend, type FakeBackendOptions } from '../../test/fake-drive';
import { NotAuthenticatedError } from './backend';
import {
  FAMILY_FILE_NAME,
  META_FILE_ID,
  NewerSchemaError,
  InvalidRemoteError,
  hasUnsyncedChanges,
  parseFamilyFile,
  syncOnce
} from './engine';

let n = 0;
const open: HelloPollyDb[] = [];

afterEach(() => {
  for (const database of open.splice(0)) database.close();
});

interface Device {
  database: HelloPollyDb;
  id: DeviceId;
  sync(): ReturnType<typeof syncOnce>;
  edit(change: (file: FamilyFile, now: Instant, device: DeviceId) => FamilyFile): Promise<FamilyFile>;
  file(): Promise<FamilyFile>;
}

/** One install over `drive`: its own IndexedDB and device id, the same Google account. */
async function device(drive: FakeDrive, options: FakeBackendOptions = {}, now = () => new Date('2026-10-19T10:00:00Z')): Promise<Device> {
  const database = new HelloPollyDb(`sync-test-${n++}`);
  open.push(database);
  const id = await getDeviceId(database);
  const backend = fakeBackend(drive, options);
  let tick = 0;
  return {
    database,
    id,
    sync: () => syncOnce({ backend, database, now }),
    // Each edit gets its own millisecond, as real taps do.
    edit: (change) => updateFamily((file) => change(file, new Date(Date.parse('2026-10-19T10:00:00Z') + tick++).toISOString(), id), database),
    file: () => loadFamily(database)
  };
}

const CHILD = 'child-ola';
const ola = { name: 'Ola', avatar: 'fox' };

/** Everything a screen derives for one child; equal here means equal on every screen. */
function derived(file: FamilyFile, child = CHILD) {
  const progress = file.progress[child];
  return {
    children: liveChildren(file).map((c) => c.id),
    settings: readSettings(file),
    stars: totalStars(progress),
    chests: chestState(progress, readSettings(file).starsPerChest),
    album: [...album(progress)].sort(),
    states: [...wordStates(progress)].sort(([a], [b]) => (a < b ? -1 : 1))
  };
}

describe('sync engine over a fake Drive', () => {
  it('the first sync creates the family file from the local copy and remembers its id', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    await a.edit((f, now, d) => addChild(f, CHILD, ola, now, d));

    const result = await a.sync();

    expect(result.created).toBe(true);
    expect([...drive.files.values()].map((f) => f.name)).toEqual([FAMILY_FILE_NAME]);
    expect(canonicalJson(drive.only())).toBe(canonicalJson(await a.file()));
    expect((await a.database.meta.get(META_FILE_ID))?.value).toBe(result.version.fileId);
    expect(await hasUnsyncedChanges(a.database)).toBe(false);
  });

  it('a second device of the same account finds the file and pulls the family', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    await a.edit((f, now, d) => addChild(f, CHILD, ola, now, d));
    await a.sync();

    const b = await device(drive);
    const result = await b.sync();

    expect(result.created).toBe(false);
    expect(result.downloaded).toBe(true);
    expect(liveChildren(await b.file()).map((c) => c.profile.name)).toEqual(['Ola']);
    expect(drive.files.size).toBe(1);
  });

  it('does not download a file whose version has not moved', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    await a.sync();
    drive.calls.length = 0;

    const result = await a.sync();

    expect(result).toMatchObject({ downloaded: false, uploaded: false });
    expect(drive.calls).toEqual(['version']);
  });

  it('two devices playing at once converge to the same derived state, and nothing is lost', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    await a.edit((f, now, d) => addChild(f, CHILD, ola, now, d));
    await a.sync();
    const b = await device(drive);
    await b.sync();

    // The same child, on two phones at the same time, neither synced in between.
    await a.edit((f, now, d) => recordIntroduced(f, CHILD, d, 'fruit.apple', now));
    await a.edit((f, _now, d) => recordAttempt(f, CHILD, d, 'fruit.apple', '2026-10-19', 0));
    await a.edit((f, _now, d) => addStars(f, CHILD, d, 12));
    await b.edit((f, now, d) => recordIntroduced(f, CHILD, d, 'colours.red', now));
    await b.edit((f, _now, d) => recordAttempt(f, CHILD, d, 'colours.red', '2026-10-19', 1));
    await b.edit((f, _now, d) => addStars(f, CHILD, d, 9));
    await b.edit((f, now, d) => recordChest(f, CHILD, d, 'chest-b1', { at: now, stickers: ['colours.red'] }));
    await a.edit((f, now, d) => setSetting(f, 'accent', 'en-US', now, d));

    await a.sync();
    await b.sync();
    await a.sync();

    const [fa, fb] = [await a.file(), await b.file()];
    expect(canonicalJson(fa)).toBe(canonicalJson(fb));
    expect(canonicalJson(drive.only())).toBe(canonicalJson(fa));
    expect(derived(fa)).toEqual(derived(fb));
    expect(derived(fa).stars).toBe(21);
    expect(derived(fa).album).toEqual(['colours.red']);
    expect(derived(fa).settings.accent).toBe('en-US');
    expect(Object.keys(fa.progress[CHILD] ?? {}).sort()).toEqual([a.id, b.id].sort());
  });

  it('a guarded race: the file moves before the upload, the cycle re-merges, nothing is lost', async () => {
    const drive = new FakeDrive();
    const hooks: FakeBackendOptions = {};
    const a = await device(drive, hooks);
    await a.edit((f, now, d) => addChild(f, CHILD, ola, now, d));
    await a.sync();
    const b = await device(drive);
    await b.sync();
    await a.edit((f, _now, d) => addStars(f, CHILD, d, 5));
    await b.edit((f, _now, d) => addStars(f, CHILD, d, 7));

    // A has downloaded and merged; before its guard reads the version, B uploads.
    let fired = 0;
    hooks.beforeUpdate = async () => {
      if (fired++ === 0) await b.sync();
    };
    await a.sync();

    // Two upload attempts: the guard caught the first, the re-merged second went through.
    expect(fired).toBe(2);
    expect(totalStars((drive.only() as FamilyFile).progress[CHILD])).toBe(12);
    await b.sync();
    expect(canonicalJson(await a.file())).toBe(canonicalJson(await b.file()));
  });

  it('an interleaved upload race past the guard: the delta dropped from the file comes back', async () => {
    const drive = new FakeDrive();
    const hooks: FakeBackendOptions = {};
    const a = await device(drive, hooks);
    await a.edit((f, now, d) => addChild(f, CHILD, ola, now, d));
    await a.sync();
    const b = await device(drive);
    await b.sync();
    await a.edit((f, _now, d) => addStars(f, CHILD, d, 5));
    await b.edit((f, _now, d) => addStars(f, CHILD, d, 7));
    await b.edit((f, now, d) => recordChest(f, CHILD, d, 'chest-b', { at: now, stickers: ['fruit.apple'] }));

    // A's guard has passed; B's whole cycle lands; then A's stale upload overwrites it.
    let fired = false;
    hooks.beforeWrite = async () => {
      if (fired) return;
      fired = true;
      await b.sync();
    };
    await a.sync();
    expect(fired).toBe(true);
    // The race PLAN.md accepts: B's delta is gone *from the file*, B still has it.
    const onDrive = drive.only() as FamilyFile;
    expect(onDrive.progress[CHILD]?.[b.id]?.stars ?? 0).toBe(0);
    expect(await hasUnsyncedChanges(b.database)).toBe(false); // B's baseline is its own upload…
    expect((await b.file()).progress[CHILD]?.[b.id]?.stars).toBe(7);

    // …and on B's next cycle the file has moved, so B merges and re-adds what it lacks.
    await b.sync();
    await a.sync();
    const [fa, fb] = [await a.file(), await b.file()];
    expect(canonicalJson(fa)).toBe(canonicalJson(fb));
    expect(canonicalJson(drive.only())).toBe(canonicalJson(fa));
    expect(derived(fa)).toEqual(derived(fb));
    expect(derived(fa).stars).toBe(12);
    expect(derived(fa).album).toEqual(['fruit.apple']);
  });

  it('random edits, syncs and races on three devices always converge with nothing lost', async () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = gen(seed);
      const drive = new FakeDrive();
      const hooks: FakeBackendOptions[] = [{}, {}, {}];
      const devices: Device[] = [];
      for (const h of hooks) devices.push(await device(drive, h));
      const [first] = devices as [Device];
      await first.edit((f, now, d) => addChild(f, CHILD, ola, now, d));

      const expectedStars = new Map<DeviceId, number>();
      const expectedChests = new Set<string>();
      for (let step = 0; step < 30; step++) {
        const i = g.int(devices.length);
        const dev = devices[i] as Device;
        const roll = g.int(10);
        if (roll < 4) {
          const stars = 1 + g.int(5);
          await dev.edit((f, _now, d) => addStars(f, CHILD, d, stars));
          expectedStars.set(dev.id, (expectedStars.get(dev.id) ?? 0) + stars);
        } else if (roll < 5) {
          const id = `chest-${seed}-${step}`;
          await dev.edit((f, now, d) => recordChest(f, CHILD, d, id, { at: now, stickers: ['fruit.apple'] }));
          expectedChests.add(id);
        } else if (roll < 6) {
          await dev.edit((f, now, d) => setSetting(f, 'starsPerChest', g.pick([10, 15, 20]), now, d));
        } else {
          // Sometimes another device's cycle lands inside this one's, before or past the guard.
          const other = devices[(i + 1 + g.int(devices.length - 1)) % devices.length] as Device;
          const h = hooks[i] as FakeBackendOptions;
          const race = g.int(3);
          let once = false;
          const interleave = async () => {
            if (once) return;
            once = true;
            await other.sync();
          };
          if (race === 1) h.beforeUpdate = interleave;
          if (race === 2) h.beforeWrite = interleave;
          await dev.sync();
          delete h.beforeUpdate;
          delete h.beforeWrite;
        }
      }
      // Every device syncs twice in turn: the file has then seen everything.
      for (let round = 0; round < 2; round++) for (const dev of devices) await dev.sync();

      const files = await Promise.all(devices.map((d) => d.file()));
      expect(new Set(files.map((f) => canonicalJson(f))).size, `seed ${seed}`).toBe(1);
      expect(canonicalJson(drive.only()), `seed ${seed}`).toBe(canonicalJson(files[0]));
      const progress = (files[0] as FamilyFile).progress[CHILD] ?? {};
      for (const [id, stars] of expectedStars) expect(progress[id]?.stars, `seed ${seed}`).toBe(stars);
      const chests = new Set(Object.values(progress).flatMap((p) => Object.keys(p.chestsOpened)));
      expect(chests, `seed ${seed}`).toEqual(expectedChests);
    }
  });

  it('two fresh devices creating the file at once settle on the older one and trash the other', async () => {
    const drive = new FakeDrive();
    const hooks: FakeBackendOptions = {};
    const a = await device(drive, hooks);
    const b = await device(drive);
    await a.edit((f, now, d) => addChild(f, CHILD, ola, now, d));
    await b.edit((f, now, d) => addChild(f, 'child-stas', { name: 'Staś', avatar: 'lion' }, now, d));
    // A found nothing; before A's create lands, B searches, finds nothing too, and creates.
    hooks.beforeCreate = async () => {
      delete hooks.beforeCreate;
      await b.sync();
    };

    const result = await a.sync();

    expect(result.created).toBe(false);
    const live = [...drive.files.values()].filter((f) => !f.trashed);
    expect(live).toHaveLength(1);
    expect((await a.database.meta.get(META_FILE_ID))?.value).toBe(live[0]?.id);
    await b.sync();
    expect(liveChildren(await b.file()).map((c) => c.profile.name).sort()).toEqual(['Ola', 'Staś']);
    expect(canonicalJson(await a.file())).toBe(canonicalJson(await b.file()));
  });

  it('a file written by a newer app is never overwritten', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    await a.sync();
    const file = [...drive.files.values()][0];
    if (file === undefined) throw new Error('no file');
    const newer = { ...(JSON.parse(file.content) as FamilyFile), schema: 2 };
    drive.write(file.id, JSON.stringify(newer));
    await a.edit((f, now, d) => addChild(f, CHILD, ola, now, d));

    await expect(a.sync()).rejects.toBeInstanceOf(NewerSchemaError);
    expect((drive.only() as { schema: number }).schema).toBe(2);
    expect(await hasUnsyncedChanges(a.database)).toBe(true);
  });

  it('a file that is not a family file stops sync and is left alone', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    await a.sync();
    const file = [...drive.files.values()][0];
    if (file === undefined) throw new Error('no file');
    drive.write(file.id, 'not json');
    await expect(a.sync()).rejects.toBeInstanceOf(InvalidRemoteError);
    expect(drive.files.get(file.id)?.content).toBe('not json');
  });

  it('a file that is gone is made again from the local copy', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    await a.edit((f, now, d) => addChild(f, CHILD, ola, now, d));
    const first = await a.sync();
    const gone = drive.files.get(first.version.fileId);
    if (gone === undefined) throw new Error('no file');
    gone.trashed = true;

    const again = await a.sync();

    expect(again.created).toBe(true);
    expect(again.version.fileId).not.toBe(first.version.fileId);
    expect(liveChildren(drive.only() as FamilyFile).map((c) => c.profile.name)).toEqual(['Ola']);
  });

  it('without a token nothing is written anywhere and the change waits', async () => {
    const drive = new FakeDrive();
    const auth = { value: true };
    const a = await device(drive, { authenticated: auth });
    await a.sync();
    auth.value = false;
    await a.edit((f, now, d) => addChild(f, CHILD, ola, now, d));
    const before = canonicalJson(drive.only());
    const baseline = await getSyncBaseline(a.database);

    await expect(a.sync()).rejects.toBeInstanceOf(NotAuthenticatedError);

    expect(canonicalJson(drive.only())).toBe(before);
    expect(await getSyncBaseline(a.database)).toEqual(baseline);
    expect(await hasUnsyncedChanges(a.database)).toBe(true);
    auth.value = true;
    await a.sync();
    expect(await hasUnsyncedChanges(a.database)).toBe(false);
  });

  it('compacts and prunes only this device\'s subtrees, and the other device takes it', async () => {
    const drive = new FakeDrive();
    const later = () => new Date('2027-06-01T10:00:00Z');
    const a = await device(drive, {}, later);
    await a.edit((f, now, d) => addChild(f, CHILD, ola, now, d));
    await a.edit((f, now, d) => addChild(f, 'child-stas', { name: 'Staś', avatar: 'lion' }, now, d));
    await a.edit((f, _now, d) => recordAttempt(f, CHILD, d, 'fruit.apple', '2026-10-19', 0));
    await a.edit((f, _now, d) => addStars(f, 'child-stas', d, 4));
    await a.edit((f, now, d) => deleteChild(f, 'child-stas', now, d));
    const b = await device(drive, {}, later);
    await b.sync();

    await a.sync();
    await b.sync();

    const fb = await b.file();
    expect(Object.keys(fb.progress[CHILD]?.[a.id]?.attempts['fruit.apple'] ?? {})).toEqual(['old']);
    expect(fb.progress['child-stas']?.[a.id]?.stars).toBe(0);
    expect(canonicalJson(fb)).toBe(canonicalJson(await a.file()));
  });
});

describe('parseFamilyFile', () => {
  it('accepts a family file and rejects anything else', async () => {
    const drive = new FakeDrive();
    const a = await device(drive);
    const file = await a.file();
    expect(parseFamilyFile(JSON.stringify(file))).toEqual(file);
    expect(() => parseFamilyFile('{')).toThrow(InvalidRemoteError);
    expect(() => parseFamilyFile('[]')).toThrow(InvalidRemoteError);
    expect(() => parseFamilyFile(JSON.stringify({ ...file, children: [] }))).toThrow(InvalidRemoteError);
    expect(() => parseFamilyFile(JSON.stringify({ ...file, schema: 99 }))).toThrow(NewerSchemaError);
  });
});
