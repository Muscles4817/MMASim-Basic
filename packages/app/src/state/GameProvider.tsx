/**
 * Game state.
 *
 * Wraps the `GameDb` from `@mmasim/data` and exposes it to screens along with a version
 * counter. Screens read through the repositories directly — there is no second copy of the
 * roster in React state to drift out of sync — and call `commit()` after a mutation to
 * trigger a re-render.
 *
 * That is a deliberate trade: the DB is the single source of truth, and React is a view of
 * it. Mirroring 800 fighters into `useState` would be both slower and a bug factory.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  createLocalStorageAdapter,
  listSaves,
  namespaceFor,
  upsertSave,
  type BackendName,
  type EraId,
  getWorld,
  loadOrCreateGame,
  setWorld,
  type GameDb,
  type SaveStorage,
  type WorldMeta,
} from '@mmasim/data';
import { displayName, recordString, type Fighter } from '@mmasim/engine';
import { clearTransientCareerState } from '../game/career';

interface GameContextValue {
  db: GameDb;
  world: WorldMeta;
  /** Increments on every commit. Screens depend on it to re-render. */
  version: number;
  /** Persist and re-render. Call once after a batch of mutations, not per mutation. */
  commit(): void;
  updateWorld(changes: Partial<WorldMeta>): void;
  /** The fighter the player controls, when in fighter mode. */
  playerFighter: Fighter | undefined;
  /** Wipe the save and start again from the 2020 seed. */
  restart(): void;
  /** Set when the last save failed. The UI must surface this rather than claim success. */
  saveError?: Error;
  /** Where saves are actually being written. Settings says so; a bug report needs it. */
  storageBackend: BackendName;
}

const GameContext = createContext<GameContextValue | undefined>(undefined);

export function GameProvider({
  children,
  saveId,
  era,
  storage,
}: {
  children: ReactNode;
  /**
   * Which save slot to open.
   *
   * Optional, and its absence is the pre-slots behaviour: one implicit save in the default
   * namespace. That is deliberate rather than a leftover — every UI test mounts this provider
   * directly and none of them care which slot they are in, so making the id required would
   * have meant editing a dozen tests to say something none of them are about.
   */
  saveId?: string;
  /** Which world to build, when this slot is empty. Ignored for a save that already exists. */
  era?: EraId;
  /**
   * Storage for this save, already hydrated.
   *
   * Supplied by `SaveGate`, which is the one place that can await it. Optional because the
   * UI tier mounts this provider directly and does not care where a throwaway world lives —
   * without a storage it falls back to the old synchronous `localStorage` adapter, which is
   * exactly what those tests were always exercising.
   */
  storage?: SaveStorage;
}) {
  // `useState` with an initialiser, not `useRef(create…())`: the latter evaluates its
  // argument on every render and throws the result away, which means re-scanning and
  // string-copying the entire roster out of localStorage on every commit.
  const [adapter] = useState(
    () => storage ?? createLocalStorageAdapter(saveId ? namespaceFor(saveId) : undefined),
  );
  const [db, setDb] = useState<GameDb>(() => loadOrCreateGame(adapter, { era }));
  const [version, setVersion] = useState(0);
  const [saveError, setSaveError] = useState<Error | undefined>(() => storage?.lastError());

  /**
   * A write-behind backend cannot report a failure by throwing — by the time the transaction
   * is refused, the render that queued it finished long ago. It reports on this channel
   * instead, and the banner in `App` is what the player sees.
   */
  useEffect(() => {
    if (!storage) return;
    setSaveError(storage.lastError());
    return storage.subscribe(setSaveError);
  }, [storage]);

  /**
   * Commit anything queued before the page can go away.
   *
   * `pagehide` and a hidden `visibilitychange` are the only endings a phone reliably fires:
   * a home-screen app is backgrounded and later killed, and `beforeunload` never runs. Without
   * this, write-behind would trade the crash it fixes for a quietly lost last save.
   */
  useEffect(() => {
    if (!storage) return;
    const flush = (): void => void storage.flush();
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [storage]);

  /**
   * Persist, and surface a failure rather than pretending it worked.
   *
   * Two shapes of failure, because there are two shapes of storage. The synchronous adapter
   * throws from `write()` and is caught here. `SaveStorage` cannot — its writes land after
   * this call returns — so it reports on the subscription above instead, and this must not
   * touch `saveError` in that case: clearing it here would wipe a genuine quota warning every
   * time the player did anything, which is precisely the "we told them it saved" failure the
   * adapter's own comment exists to prevent.
   */
  const persist = useCallback(() => {
    try {
      db.save();
      syncRegistry(db, saveId);
      if (!storage) setSaveError(undefined);
    } catch (error) {
      setSaveError(error instanceof Error ? error : new Error(String(error)));
    }
  }, [db, saveId, storage]);

  const commit = useCallback(() => {
    persist();
    setVersion((v) => v + 1);
  }, [persist]);

  const updateWorld = useCallback(
    (changes: Partial<WorldMeta>) => {
      setWorld(db, changes);
      persist();
      setVersion((v) => v + 1);
    },
    [db, persist],
  );

  const restart = useCallback(() => {
    // Transient career state lives in sessionStorage and survives a world reset. Left
    // behind, a freshly reset world starts with a phantom booked fight against a fighter
    // from the previous career.
    clearTransientCareerState();
    db.reset();
    setDb(loadOrCreateGame(adapter, { era }));
    if (!storage) setSaveError(undefined);
    setVersion((v) => v + 1);
  }, [db, adapter, era, storage]);

  const value = useMemo<GameContextValue>(() => {
    const world = getWorld(db);
    const playerFighter = world.playerFighterId
      ? (db.fighters.findById(world.playerFighterId) as Fighter | undefined)
      : undefined;
    return {
      db,
      world,
      version,
      commit,
      updateWorld,
      playerFighter,
      restart,
      saveError,
      storageBackend: storage?.backend ?? 'localstorage',
    };
    // `version` is in the dependency list on purpose: it is the signal that the underlying
    // repositories have changed and these derived values must be recomputed.
  }, [db, version, commit, updateWorld, restart, saveError, storage]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}

/**
 * Keep the menu's summary of this save in step with the save itself.
 *
 * The registry exists so the menu can describe a save without opening it, which means nothing
 * updates it except the save being played. Written on every persist rather than on some exit
 * event, because there is no reliable exit — a closed tab fires nothing dependable, and a
 * summary that is one session stale is a menu that lies about what you have.
 *
 * Silent on failure. A registry write that fails has cost the player a subtitle on a menu row;
 * the game itself is already saved by this point, and surfacing it would mean showing a save
 * error for a save that succeeded.
 */
function syncRegistry(db: GameDb, saveId: string | undefined): void {
  if (!saveId) return;
  try {
    const store = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    if (!store) return;

    const existing = listSaves(store).find((s) => s.id === saveId);
    if (!existing) return;

    const world = getWorld(db);
    const player = world.playerFighterId
      ? (db.fighters.findById(world.playerFighterId) as Fighter | undefined)
      : undefined;

    upsertSave(store, {
      ...existing,
      // The save takes the player's name the moment there is one, because "2026 career" is a
      // placeholder and their name is what they will look for in the list.
      name: player ? displayName(player) : existing.name,
      playerName: player ? displayName(player) : undefined,
      playerRole: world.playerRole,
      day: world.day,
      record: player ? recordString(player.summary) : undefined,
      lastPlayedIso: new Date().toISOString(),
    });
  } catch {
    /* A stale subtitle is not worth failing a successful save over. */
  }
}
