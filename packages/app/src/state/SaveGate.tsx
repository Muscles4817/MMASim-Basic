/**
 * Menu or game.
 *
 * Sits above `GameProvider` because the menu has no game: no `GameDb`, no world, no player.
 * Putting the choice inside the provider would mean making `db` optional, which every screen
 * in the app currently relies on being present — one nullable field would ripple through
 * twenty files to serve a screen that does not want it.
 *
 * The active save is remembered so a reload during play returns you to your game rather than
 * to the menu, but the *first* landing of a session is always the menu. That is the ask, and
 * it is also right: the menu is where you find out what you have.
 */

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import {
  deleteSave,
  listSaves,
  nextSaveId,
  upsertSave,
  type EraId,
  type SaveSummary,
} from '@mmasim/data';
import { GameProvider } from './GameProvider';
import { MenuScreen } from '../screens/MenuScreen';

/** Which save is open right now. Session-scoped: a new tab starts at the menu. */
const ACTIVE_KEY = 'mmasim:active-save';

/**
 * `localStorage` may be entirely unavailable — a locked-down browser, private mode in some
 * configurations. The rest of the app already degrades rather than dying, so this does too:
 * with no storage there are no saves to list, and starting a game still works for as long as
 * the tab is open.
 */
function storage(): Storage | undefined {
  try {
    return typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? (globalThis as unknown as { localStorage: Storage }).localStorage
      : undefined;
  } catch {
    return undefined;
  }
}

function readActive(): string | undefined {
  try {
    return sessionStorage.getItem(ACTIVE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function SaveGate({ children }: { children: ReactNode }) {
  const [saves, setSaves] = useState<SaveSummary[]>(() => {
    const store = storage();
    return store ? listSaves(store) : [];
  });
  const [active, setActive] = useState<{ id: string; era: EraId } | undefined>(() => {
    const id = readActive();
    if (!id) return undefined;
    const store = storage();
    const found = store ? listSaves(store).find((s) => s.id === id) : undefined;
    return found ? { id: found.id, era: found.era } : undefined;
  });

  const open = useCallback((save: SaveSummary) => {
    const store = storage();
    if (store) {
      // Touching `lastPlayed` on open rather than on exit, because there is no reliable exit —
      // a closed tab fires nothing dependable, and a save you opened is the one you want first
      // in the list next time regardless of how long you stayed.
      upsertSave(store, { ...save, lastPlayedIso: new Date().toISOString() });
      setSaves(listSaves(store));
    }
    try {
      sessionStorage.setItem(ACTIVE_KEY, save.id);
    } catch {
      /* Playable without it; you simply land on the menu after a reload. */
    }
    setActive({ id: save.id, era: save.era });
  }, []);

  const create = useCallback(
    (era: EraId, name: string) => {
      const nowIso = new Date().toISOString();
      const id = nextSaveId(saves, nowIso);
      open({ id, name, era, createdAtIso: nowIso, lastPlayedIso: nowIso, day: 0 });
    },
    [saves, open],
  );

  const remove = useCallback((id: string) => {
    const store = storage();
    if (!store) return;
    deleteSave(store, id);
    setSaves(listSaves(store));
  }, []);

  if (!active) {
    return (
      <MenuScreen saves={saves} onContinue={open} onNew={create} onDelete={remove} />
    );
  }

  /*
   * Keyed on the save id so switching saves remounts the provider.
   *
   * Without the key, React would keep the existing provider — and its `useState` initialisers,
   * which is where the storage adapter and the whole world are built — so choosing a different
   * save would show you the previous save's roster under the new save's name.
   */
  return (
    <GameProvider key={active.id} saveId={active.id} era={active.era}>
      {children}
    </GameProvider>
  );
}
