/**
 * Routing.
 *
 * A hand-rolled hash router rather than a dependency. The app has a fixed, small set of
 * routes and no need for nested layouts or data loaders; a router library would be more
 * code than this, not less.
 *
 * Hash-based because it works from `file://` and any static host with no server rewrites,
 * and because the back button must work — on mobile the hardware/gesture back is the
 * primary navigation control and a state-machine "router" that ignores it feels broken.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { EditorEntityKind } from '../game/editorSchema';

/**
 * Editable types, duplicated here as a runtime list purely so a hand-typed URL cannot
 * produce a route with a kind the editor has no schema for.
 */
const EDITOR_KINDS: readonly EditorEntityKind[] = [
  'promotions',
  'gyms',
  'coaches',
  'referees',
  'judges',
  'commentators',
];

export type Route =
  | { name: 'start' }
  | { name: 'create' }
  | { name: 'training' }
  | { name: 'hub' }
  | { name: 'roster' }
  | { name: 'fighter'; id: string }
  | { name: 'camp' }
  | { name: 'fight'; boutId: string }
  | { name: 'rankings' }
  | { name: 'promotions' }
  | { name: 'editor' }
  | { name: 'editorFighter'; id: string }
  | { name: 'editorList'; kind: EditorEntityKind }
  | { name: 'editorEntity'; kind: EditorEntityKind; id: string }
  | { name: 'settings' };

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const [head, param, rest] = path.split('/');
  switch (head) {
    case '':
    case 'start':
      return { name: 'start' };
    case 'create':
      return { name: 'create' };
    case 'training':
      return { name: 'training' };
    case 'hub':
      return { name: 'hub' };
    case 'roster':
      return { name: 'roster' };
    case 'fighter':
      return param ? { name: 'fighter', id: param } : { name: 'roster' };
    case 'camp':
      return { name: 'camp' };
    case 'fight':
      return param ? { name: 'fight', boutId: param } : { name: 'hub' };
    case 'rankings':
      return { name: 'rankings' };
    case 'promotions':
      return { name: 'promotions' };
    case 'editor':
      return param ? { name: 'editorFighter', id: param } : { name: 'editor' };
    case 'edit': {
      // #/edit/<kind> and #/edit/<kind>/<id>. Kept off the `editor` prefix so the existing
      // #/editor/<fighterId> links in the wild keep meaning what they meant.
      const kind = param as EditorEntityKind | undefined;
      if (!kind || !EDITOR_KINDS.includes(kind)) return { name: 'editor' };
      return rest ? { name: 'editorEntity', kind, id: rest } : { name: 'editorList', kind };
    }
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'hub' };
  }
}

export function toHash(route: Route): string {
  switch (route.name) {
    case 'fighter':
      return `#/fighter/${route.id}`;
    case 'fight':
      return `#/fight/${route.boutId}`;
    case 'editorFighter':
      return `#/editor/${route.id}`;
    case 'editorList':
      return `#/edit/${route.kind}`;
    case 'editorEntity':
      return `#/edit/${route.kind}/${route.id}`;
    default:
      return `#/${route.name}`;
  }
}

interface RouterValue {
  route: Route;
  navigate(route: Route): void;
  /** Replaces the current entry instead of pushing, for redirects. */
  replace(route: Route): void;
  back(): void;
}

const RouterContext = createContext<RouterValue | undefined>(undefined);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  /**
   * How many entries deep into the app we are.
   *
   * A bare `history.back()` walks out of the app entirely when the current screen was the
   * entry point — deep-linking to a fighter, or refreshing on one, would leave the back
   * control pointing at whatever site the user was on before. Counting our own pushes lets
   * us fall back to a sensible in-app destination instead.
   */
  const depth = useRef(0);

  useEffect(() => {
    const onHashChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    depth.current += 1;
    window.location.hash = toHash(next);
    // Every navigation starts at the top: carrying scroll position across screens is one of
    // the most disorienting things a mobile app can do.
    window.scrollTo({ top: 0 });
  }, []);

  const replace = useCallback((next: Route) => {
    window.history.replaceState(null, '', toHash(next));
    setRoute(next);
    window.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => {
    if (depth.current > 0) {
      depth.current -= 1;
      window.history.back();
      return;
    }
    window.history.replaceState(null, '', toHash({ name: 'hub' }));
    setRoute({ name: 'hub' });
    window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo(() => ({ route, navigate, replace, back }), [route, navigate, replace, back]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside RouterProvider');
  return ctx;
}
