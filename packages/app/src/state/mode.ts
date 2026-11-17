/**
 * Which game the player is playing, as far as the stylesheet is concerned.
 *
 * Fighter, coach and promoter are three different games sharing one world (doc 35). Each has its
 * own visual voice — the fight poster, the corner notebook, the broadcast package — declared as a
 * token layer in `styles/modes/*.css` and switched on by a single `data-mode` attribute on
 * `<html>`. Nothing else in the app branches on mode for styling; a component that needs to look
 * different per mode reads a token.
 *
 * `neutral` is the menu, the new-game flow before a mode is picked, and anything else that belongs
 * to no career. It is the absence of the attribute rather than a value of it, so the base palette
 * in tokens.css *is* the neutral voice and there is no fourth layer to keep in step.
 */

import { useLayoutEffect } from 'react';
import type { PlayableMode, Route } from './router';

export type VisualMode = PlayableMode | 'neutral';

/**
 * The mode a screen should be drawn in.
 *
 * The save's role decides it once there is one. Before that, the new-game flow previews the mode
 * being chosen: picking a fighter happens on the poster, picking a promotion in the studio, so the
 * first thing a player sees of a mode is what it will look like rather than a neutral form.
 */
export function visualModeFor(role: PlayableMode | undefined, route: Route): VisualMode {
  if (role) return role;
  if (route.name === 'start' && route.mode) return route.mode;
  return 'neutral';
}

/**
 * Stamp the mode on the document for as long as the calling component is mounted.
 *
 * Layout effect, for the same reason as the theme: stamping after paint flashes the neutral
 * palette on every navigation into a career. Cleared on unmount so the main menu — which renders
 * outside any career shell — always falls back to neutral rather than inheriting the last save's
 * colours.
 */
export function useDocumentMode(mode: VisualMode): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (mode === 'neutral') root.removeAttribute('data-mode');
    else root.setAttribute('data-mode', mode);
    syncThemeColor();
    return () => {
      root.removeAttribute('data-mode');
    };
  }, [mode]);
}

/**
 * Point the browser chrome at whatever `--bg` currently resolves to.
 *
 * Read from the computed style rather than from a table of hex values, because the background
 * now depends on two independent switches — the theme and the mode — and a table of their
 * product is a table that drifts. Called after either switch changes.
 */
export function syncThemeColor(): void {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (!bg) return;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}
