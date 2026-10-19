import type { Component } from 'svelte';
import { wrap } from 'svelte-spa-router/wrap';
import type { WrappedComponent } from 'svelte-spa-router/wrap';
import Placeholder from './components/Placeholder.svelte';
import { notFound, screens, type Screen } from './screens';
import Start from '../screens/Start.svelte';
import Speech from '../screens/parent/Speech.svelte';

/**
 * Hash-based routes (svelte-spa-router). Hash routing means the static server only ever serves
 * one document, so Caddy needs no per-route rules.
 *
 * A screen marked `built` renders its component below; every other route is a placeholder
 * until its phase builds it. The catch-all is last, because the router matches in insertion
 * order.
 */
/** What the router hands every screen. */
type ScreenComponent = Component<{ screen: Screen; params?: Record<string, string> | null }>;

const built: Record<string, ScreenComponent> = {
  '/': Start,
  '/parent/speech': Speech
};

function route(screen: Screen): WrappedComponent {
  if (!screen.built) return wrap({ component: Placeholder, props: { screen } });
  const component = built[screen.path];
  if (!component) throw new Error(`Screen ${screen.path} is marked built but has no component`);
  return wrap({ component, props: { screen } });
}

export const routes = new Map<string, WrappedComponent>([
  ...screens.map((s): [string, WrappedComponent] => [s.path, route(s)]),
  [notFound.path, route(notFound)]
]);
