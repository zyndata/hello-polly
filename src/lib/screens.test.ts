import { describe, expect, it } from 'vitest';
import { notFound, screens } from './screens';

/** PLAN.md "Screens and navigation", in its order. */
const PLANNED = [
  '/',
  '/child/:id',
  '/child/:id/lesson',
  '/child/:id/play',
  '/child/:id/play/:game',
  '/child/:id/stories',
  '/child/:id/stories/:storyId',
  '/child/:id/album',
  '/child/:id/chest',
  '/parent',
  '/parent/child/:id',
  '/parent/family',
  '/parent/speech',
  '/join/:fileId',
  '/setup'
];

describe('screens', () => {
  it('lists exactly the screens in PLAN.md', () => {
    expect(screens.map((s) => s.path)).toEqual(PLANNED);
  });

  it('gives every screen a title', () => {
    for (const s of [...screens, notFound]) expect(s.title.trim()).not.toBe('');
  });

  it('puts the parent panel and its sub-screens in the parent area', () => {
    for (const s of screens.filter((s) => s.path.startsWith('/parent'))) {
      expect(s.area).toBe('parent');
    }
    for (const s of screens.filter((s) => s.path.startsWith('/child'))) {
      expect(s.area).toBe('child');
    }
  });
});
