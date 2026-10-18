import { wrap } from 'svelte-spa-router/wrap';
import type { WrappedComponent } from 'svelte-spa-router/wrap';
import Placeholder from './components/Placeholder.svelte';
import { notFound, screens, type Screen } from './screens';

/**
 * Hash-based routes (svelte-spa-router). Hash routing means the static server only ever serves
 * one document, so Caddy needs no per-route rules.
 *
 * Every route is a placeholder until its phase replaces the entry with the real screen. The
 * catch-all is last, because the router matches in insertion order.
 */
function placeholder(screen: Screen): WrappedComponent {
  return wrap({ component: Placeholder, props: { screen } });
}

export const routes = new Map<string, WrappedComponent>([
  ...screens.map((s): [string, WrappedComponent] => [s.path, placeholder(s)]),
  [notFound.path, placeholder(notFound)]
]);
