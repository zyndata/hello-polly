import { describe, expect, it } from 'vitest';
import { familyFile as family, gen } from './arbitrary';
import { backupFileName, exportFamily, importFamily } from './backup';
import { addChild, liveChildren } from './children';
import { activityCalendar, learnedPerTopic, needsPractice, stickersCollected, storiesHeard } from './dashboard';
import { emptyFamily, readSettings } from './family';
import { wordStates } from './learning';
import { canonicalJson } from './lww';
import { mergeFamily } from './merge';
import { lessonsDone } from './progress';
import { album, chestState, totalStars } from './rewards';
import { parseFamilyFile } from '../sync/engine';
import { stickers, stories, topics } from '../content';
import { childPlan } from './children';
import type { FamilyFile } from '../types';

/** Everything the screens derive, for every child in the file. */
function derived(file: FamilyFile) {
  return Object.keys(file.children)
    .sort()
    .map((child) => {
      const progress = file.progress[child];
      return {
        child,
        children: liveChildren(file).map((c) => c.id),
        settings: readSettings(file),
        plan: childPlan(file, child),
        limits: file.limits[child]?.v,
        stars: totalStars(progress),
        chests: chestState(progress, readSettings(file).starsPerChest),
        album: [...album(progress)].sort(),
        lessons: lessonsDone(progress),
        states: [...wordStates(progress)].sort(([a], [b]) => (a < b ? -1 : 1)),
        perTopic: learnedPerTopic(wordStates(progress), childPlan(file, child), topics).map((t) => [t.topic.id, t.learned, t.met]),
        practice: needsPractice(progress, () => true),
        calendar: activityCalendar(progress, '2026-10-18'),
        stickers: stickersCollected(progress, stickers),
        stories: storiesHeard(progress, stories)
      };
    });
}

describe('export and import of the family (Phase 10)', () => {
  it('export → import into a fresh profile reproduces the file and every derived state exactly', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const original = family(gen(seed));
      const text = exportFamily(original);
      const fresh = emptyFamily(`fresh-${seed}`);
      const restored = importFamily(fresh, parseFamilyFile(text));
      expect(canonicalJson(restored), `seed ${seed}`).toBe(canonicalJson(original));
      expect(derived(restored)).toEqual(derived(original));
    }
  });

  it('an import into a device with children merges, keeps its family id and loses nothing', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const g = gen(seed);
      const local = addChild(family(g), 'child-local', { name: 'Zosia', avatar: 'fox' }, '2026-10-18T09:00:00.000Z', 'dev-a');
      const backup = family(g);
      const imported = importFamily(local, backup);
      expect(imported.familyId).toBe(local.familyId);
      expect(canonicalJson(imported)).toBe(canonicalJson({ ...mergeFamily(local, backup), familyId: local.familyId }));
      // Nothing on the device goes: merging the device's copy again changes nothing.
      expect(canonicalJson(mergeFamily(imported, local))).toBe(canonicalJson(imported));
      expect(liveChildren(imported).map((c) => c.id)).toContain('child-local');
      // Importing the same backup twice is the same as once.
      expect(canonicalJson(importFamily(imported, backup))).toBe(canonicalJson(imported));
    }
  });

  it('the file is the family file as stored, named by the day', () => {
    const file = family(gen(7));
    expect(JSON.parse(exportFamily(file))).toEqual(file);
    expect(exportFamily(file)).not.toMatch(/deviceId|token|driveFileId/);
    expect(backupFileName('2026-10-20')).toBe('hello-polly-rodzina-2026-10-20.json');
  });
});
