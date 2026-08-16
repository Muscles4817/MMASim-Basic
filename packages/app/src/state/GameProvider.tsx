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

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  createLocalStorageAdapter,
  getWorld,
  loadOrCreateGame,
  setWorld,
  type GameDb,
  type WorldMeta,
} from '@mmasim/data';
import type { Fighter } from '@mmasim/engine';
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
}

const GameContext = createContext<GameContextValue | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  // `useState` with an initialiser, not `useRef(create…())`: the latter evaluates its
  // argument on every render and throws the result away, which means re-scanning and
  // string-copying the entire roster out of localStorage on every commit.
  const [adapter] = useState(() => createLocalStorageAdapter());
  const [db, setDb] = useState<GameDb>(() => loadOrCreateGame(adapter));
  const [version, setVersion] = useState(0);
  const [saveError, setSaveError] = useState<Error | undefined>();

  /**
   * Persist, and surface a failure rather than pretending it worked.
   *
   * A quota error used to be swallowed at the adapter, so the player was told their game was
   * saved while nothing had been written. It now throws; the UI's job is to say so.
   */
  const persist = useCallback(() => {
    try {
      db.save();
      setSaveError(undefined);
    } catch (error) {
      setSaveError(error instanceof Error ? error : new Error(String(error)));
    }
  }, [db]);

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
    setDb(loadOrCreateGame(adapter));
    setSaveError(undefined);
    setVersion((v) => v + 1);
  }, [db, adapter]);

  const value = useMemo<GameContextValue>(() => {
    const world = getWorld(db);
    const playerFighter = world.playerFighterId
      ? (db.fighters.findById(world.playerFighterId) as Fighter | undefined)
      : undefined;
    return { db, world, version, commit, updateWorld, playerFighter, restart, saveError };
    // `version` is in the dependency list on purpose: it is the signal that the underlying
    // repositories have changed and these derived values must be recomputed.
  }, [db, version, commit, updateWorld, restart, saveError]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
