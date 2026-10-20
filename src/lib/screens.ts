/**
 * Every screen in PLAN.md "Screens and navigation", as data.
 *
 * Kept free of Svelte imports so the unit suite can assert the list against the plan, and so
 * `routes.ts` stays a mechanical mapping. Until a phase builds a screen (`built`), the route
 * renders `Placeholder.svelte` with the title below.
 */

/**
 * Which base layout a screen uses. A `child` screen is operated by a pre-reader: full-bleed
 * sea, big targets, nothing to read. A `parent` screen is an ordinary Polish UI.
 */
export type ScreenArea = 'child' | 'parent';

export interface Screen {
  /** svelte-spa-router path pattern. */
  path: string;
  /** Polish title, shown by the placeholder (and later the parent-facing name of the screen). */
  title: string;
  area: ScreenArea;
  /** The PLAN.md phase that builds the real screen. */
  phase: number;
  /** The real screen exists (`routes.ts` maps it); otherwise the route is a placeholder. */
  built?: true;
}

export const screens: readonly Screen[] = [
  { path: '/', title: 'Start', area: 'child', phase: 3, built: true },
  { path: '/child/:id', title: 'Mapa skarbów', area: 'child', phase: 4, built: true },
  { path: '/child/:id/lesson', title: 'Lekcja', area: 'child', phase: 5, built: true },
  { path: '/child/:id/play', title: 'Gry', area: 'child', phase: 5, built: true },
  { path: '/child/:id/play/:game', title: 'Gra', area: 'child', phase: 5, built: true },
  { path: '/child/:id/stories', title: 'Bajki', area: 'child', phase: 9, built: true },
  { path: '/child/:id/stories/:storyId', title: 'Bajka', area: 'child', phase: 9, built: true },
  { path: '/child/:id/album', title: 'Album z naklejkami', area: 'child', phase: 6, built: true },
  { path: '/child/:id/chest', title: 'Skrzynia skarbów', area: 'child', phase: 6, built: true },
  { path: '/parent', title: 'Panel rodzica', area: 'parent', phase: 4, built: true },
  { path: '/parent/child/:id', title: 'Dziecko', area: 'parent', phase: 4, built: true },
  { path: '/parent/family', title: 'Rodzina', area: 'parent', phase: 7, built: true },
  { path: '/parent/speech', title: 'Mowa i głosy', area: 'parent', phase: 3, built: true },
  { path: '/join/:fileId', title: 'Dołącz do rodziny', area: 'parent', phase: 8, built: true },
  { path: '/setup', title: 'Pierwsze uruchomienie', area: 'parent', phase: 4, built: true }
];

/** What any other hash path renders. Not a PLAN.md screen, so not in the list above. */
export const notFound: Screen = {
  path: '*',
  title: 'Nie ma takiej strony',
  area: 'parent',
  phase: 1
};
