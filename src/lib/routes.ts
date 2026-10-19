import type { Component } from 'svelte';
import { wrap } from 'svelte-spa-router/wrap';
import type { WrappedComponent } from 'svelte-spa-router/wrap';
import Gated from './components/Gated.svelte';
import Placeholder from './components/Placeholder.svelte';
import { notFound, screens, type Screen } from './screens';
import Setup from '../screens/Setup.svelte';
import Start from '../screens/Start.svelte';
import Album from '../screens/child/Album.svelte';
import ChestScreen from '../screens/child/ChestScreen.svelte';
import Game from '../screens/child/Game.svelte';
import Lesson from '../screens/child/Lesson.svelte';
import Shelf from '../screens/child/Shelf.svelte';
import TreasureMap from '../screens/child/Map.svelte';
import ParentChild from '../screens/parent/Child.svelte';
import Panel from '../screens/parent/Panel.svelte';
import Speech from '../screens/parent/Speech.svelte';

/**
 * Hash-based routes (svelte-spa-router). Hash routing means the static server only ever serves
 * one document, so Caddy needs no per-route rules.
 *
 * A screen marked `built` renders its component below; every other route is a placeholder
 * until its phase builds it. Every `/parent` route, built or not, sits behind the parent gate
 * (STATE.md decision 37). The catch-all is last, because the router matches in insertion order.
 */
/** What the router hands every screen. */
type ScreenComponent = Component<{ screen: Screen; params?: Record<string, string> | null }>;

const built: Record<string, ScreenComponent> = {
  '/': Start,
  '/child/:id': TreasureMap,
  '/child/:id/lesson': Lesson,
  '/child/:id/play': Shelf,
  '/child/:id/play/:game': Game,
  '/child/:id/album': Album,
  '/child/:id/chest': ChestScreen,
  '/parent': Panel,
  '/parent/child/:id': ParentChild,
  '/parent/speech': Speech,
  '/setup': Setup
};

export const isGated = (screen: Screen): boolean => screen.path === '/parent' || screen.path.startsWith('/parent/');

function route(screen: Screen): WrappedComponent {
  const component = screen.built ? built[screen.path] : (Placeholder as ScreenComponent);
  if (!component) throw new Error(`Screen ${screen.path} is marked built but has no component`);
  if (isGated(screen)) return wrap({ component: Gated as ScreenComponent, props: { screen, inner: component } });
  return wrap({ component, props: { screen } });
}

export const routes = new Map<string, WrappedComponent>([
  ...screens.map((s): [string, WrappedComponent] => [s.path, route(s)]),
  [notFound.path, route(notFound)]
]);
