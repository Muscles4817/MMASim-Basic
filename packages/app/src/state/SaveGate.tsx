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
 *
 * It is also the one place in the app that waits on storage. Saves live in IndexedDB now, which
 * is asynchronous, and the entire data layer below this line is synchronous by design — so the
 * namespace is hydrated here, once, before a `GameProvider` exists to read it. Everything
 * downstream is unchanged and unaware.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  deleteSave,
  deleteSaveStorage,
  listSaves,
  namespaceFor,
  nextSaveId,
  openSaveStorage,
  upsertSave,
  worldSizeMeta,
  type EraId,
  type SaveStorage,
  type SaveSummary,
  type WorldSize,
} from '@mmasim/data';
import { GameProvider } from './GameProvider';
import { MenuScreen } from '../screens/MenuScreen';
import { generateWorld } from '../game/newWorld';
import { Button } from '../ui';

/** Which save is open right now. Session-scoped: a new tab starts at the menu. */
const ACTIVE_KEY = 'mmasim:active-save';

/**
 * `localStorage` may be entirely unavailable — a locked-down browser, private mode in some
 * configurations. The rest of the app already degrades rather than dying, so this does too:
 * with no storage there are no saves to list, and starting a game still works for as long as
 * the tab is open.
 *
 * Note that this is the *registry* only — a few hundred bytes of menu summaries. The saves
 * themselves moved to IndexedDB; the registry stays here because the menu reads it during a
 * render and it is small enough that the quota was never the problem.
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

/** The save being opened, and how far that has got. */
type Session =
  | { status: 'opening'; id: string; era: EraId }
  /**
   * Building a generated world, which is seconds of simulated sport rather than a read.
   *
   * A distinct status rather than a flag on `opening`, because it is a different promise to the
   * player: opening is a wait they cannot influence and this is a job with a length. Doc 27 § 10.6
   * measured it at three seconds for a Small world and twenty-five for a Large one on a desktop.
   */
  | {
      status: 'building';
      id: string;
      era: EraId;
      storage: SaveStorage;
      size: WorldSize;
      done: number;
      label: string;
    }
  | { status: 'open'; id: string; era: EraId; storage: SaveStorage }
  | { status: 'failed'; id: string; era: EraId; error: Error };

export function SaveGate({ children }: { children: ReactNode }) {
  const [saves, setSaves] = useState<SaveSummary[]>(() => {
    const store = storage();
    return store ? listSaves(store) : [];
  });
  const [active, setActive] = useState<{ id: string; era: EraId; size?: WorldSize } | undefined>(
    () => {
      const id = readActive();
      if (!id) return undefined;
      const store = storage();
      const found = store ? listSaves(store).find((s) => s.id === id) : undefined;
      return found ? { id: found.id, era: found.era, size: found.size } : undefined;
    },
  );
  const [session, setSession] = useState<Session | undefined>();

  /**
   * Hydrate the chosen save.
   *
   * Guarded against its own result arriving late: opening save A, going back and opening save
   * B is entirely possible on a slow device, and without the check the second game would be
   * handed the first one's storage.
   */
  useEffect(() => {
    if (!active) {
      setSession(undefined);
      return;
    }
    let current = true;
    setSession({ status: 'opening', id: active.id, era: active.era });

    openSaveStorage(namespaceFor(active.id)).then(
      (opened) => {
        // Lost the race: nothing else will ever read this, so do not leave writes queued.
        if (!current) {
          void opened.flush();
          return;
        }

        /*
         * A generated world that has not been built yet.
         *
         * Probed on the storage rather than trusted from the registry, because reopening a
         * generated save must *not* rebuild it — the world is already in there, and eight years
         * of somebody's history would be replaced by eight different years.
         */
        const size = active.size;
        if (size !== undefined && opened.read('world') === undefined) {
          setSession({
            status: 'building',
            ...active,
            size,
            storage: opened,
            done: 0,
            label: 'Founding the promotions',
          });

          void generateWorld({
            size,
            seed: `${active.id}`,
            adapter: opened,
            createdAtIso: new Date().toISOString(),
            onProgress: ({ done, label }) => {
              if (current) {
                setSession((s) => (s?.status === 'building' ? { ...s, done, label } : s));
              }
            },
          }).then(
            () => {
              if (current) setSession({ status: 'open', ...active, storage: opened });
            },
            (cause: unknown) => {
              if (!current) return;
              setSession({
                status: 'failed',
                ...active,
                error: cause instanceof Error ? cause : new Error(String(cause)),
              });
            },
          );
          return;
        }

        setSession({ status: 'open', ...active, storage: opened });
      },
      (cause: unknown) => {
        if (!current) return;
        setSession({
          status: 'failed',
          ...active,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
      },
    );

    return () => void (current = false);
  }, [active]);

  const open = useCallback((save: SaveSummary) => {
    const store = storage();
    if (store) {
      try {
        // Touching `lastPlayed` on open rather than on exit, because there is no reliable exit —
        // a closed tab fires nothing dependable, and a save you opened is the one you want first
        // in the list next time regardless of how long you stayed.
        upsertSave(store, { ...save, lastPlayedIso: new Date().toISOString() });
        setSaves(listSaves(store));
      } catch {
        /*
         * A registry write that fails costs a row in a menu. It used to cost the whole app:
         * this runs in a click handler, so a `localStorage` quota refusal here propagated
         * straight to the error boundary and the player could not open a save at all — on a
         * device where the thing that filled the quota was the save they were trying to open.
         */
      }
    }
    try {
      sessionStorage.setItem(ACTIVE_KEY, save.id);
    } catch {
      /* Playable without it; you simply land on the menu after a reload. */
    }
    setActive({ id: save.id, era: save.era, size: save.size });
  }, []);

  const create = useCallback(
    (era: EraId, name: string, size?: WorldSize) => {
      const nowIso = new Date().toISOString();
      const id = nextSaveId(saves, nowIso);
      open({ id, name, era, size, createdAtIso: nowIso, lastPlayedIso: nowIso, day: 0 });
    },
    [saves, open],
  );

  const remove = useCallback((id: string) => {
    const store = storage();
    if (store) {
      deleteSave(store, id);
      setSaves(listSaves(store));
    }
    // The save's own bytes are in IndexedDB, which `deleteSave` cannot reach — it sweeps
    // `localStorage`. Without this the roster survives its own deletion, invisible and
    // undeletable, holding disk for a career that no longer appears anywhere.
    void deleteSaveStorage(namespaceFor(id));
  }, []);

  const toMenu = useCallback(() => {
    try {
      sessionStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* The state below is what actually decides which screen renders. */
    }
    setActive(undefined);
  }, []);

  if (!active) {
    return <MenuScreen saves={saves} onContinue={open} onNew={create} onDelete={remove} />;
  }

  // `session` is undefined for the one render between choosing a save and the effect that
  // opens it. Falling through to the menu there would flash it back at the player.
  if (!session || session.status === 'opening') return <Opening />;

  if (session.status === 'building') {
    return <Building size={session.size} done={session.done} label={session.label} />;
  }

  if (session.status === 'failed') {
    return <OpenFailed error={session.error} onBack={toMenu} />;
  }

  /*
   * Keyed on the save id so switching saves remounts the provider.
   *
   * Without the key, React would keep the existing provider — and its `useState` initialisers,
   * which is where the storage adapter and the whole world are built — so choosing a different
   * save would show you the previous save's roster under the new save's name.
   */
  return (
    <GameProvider key={session.id} saveId={session.id} era={session.era} storage={session.storage}>
      {children}
    </GameProvider>
  );
}

/**
 * The wait between choosing a save and playing it.
 *
 * Deliberately plain and deliberately not a spinner. Reading a save is fast enough that this
 * is usually a single frame; the one time it is not is a cold start on a phone, where the
 * honest thing to show is a word rather than an animation implying something is stuck.
 */
function Opening() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-4)',
        color: 'var(--text-muted)',
      }}
    >
      <p>Opening your save…</p>
    </div>
  );
}

/**
 * Building a world, with a bar.
 *
 * A real bar rather than a spinner, and the difference matters here in a way it did not for
 * `Opening`: this is a job with a known length, so the honest thing is to show how much of it is
 * left. It is also the one screen in the game a player is asked to wait a measurable time in
 * front of, and doc 27 § 7's whole budget exists because of it.
 */
function Building({ size, done, label }: { size: WorldSize; done: number; label: string }) {
  const meta = worldSizeMeta(size);
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-4)',
      }}
    >
      <div style={{ maxWidth: '28rem', width: '100%', textAlign: 'center' }}>
        <h1 style={{ marginBottom: 'var(--space-2)' }}>Building the sport</h1>
        <p className="prose" style={{ marginBottom: 'var(--space-4)' }}>
          A {meta.name.toLowerCase()} world — promotions, fighters, and eight years of history for
          them to have lived through.
        </p>
        <div
          role="progressbar"
          aria-valuenow={Math.round(done * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Building the world"
          style={{
            height: '0.5rem',
            borderRadius: '999px',
            background: 'var(--surface-2, rgba(127,127,127,0.2))',
            overflow: 'hidden',
            marginBottom: 'var(--space-2)',
          }}
        >
          <div
            style={{
              width: `${Math.round(done * 100)}%`,
              height: '100%',
              background: 'var(--accent, currentColor)',
              transition: 'width 200ms linear',
            }}
          />
        </div>
        <p className="faint" style={{ fontSize: 'var(--text-sm)' }}>
          {label}
        </p>
      </div>
    </div>
  );
}

/**
 * Storage refused to open at all.
 *
 * A dead end for this save, but not for the app: the menu still works, other saves may open
 * fine, and the player is told which of those they are looking at. This used to be a blank
 * page, because the failure arrived as a throw during a render.
 */
function OpenFailed({ error, onBack }: { error: Error; onBack(): void }) {
  return (
    <div
      role="alert"
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-4)',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '32rem' }}>
        <h1 style={{ marginBottom: 'var(--space-3)' }}>That save would not open</h1>
        <p className="prose" style={{ marginBottom: 'var(--space-3)' }}>
          Your device refused to hand over the stored game. Nothing has been deleted — this is
          usually a browser in private mode, or storage that has been locked down.
        </p>
        <p
          className="faint"
          style={{ marginBottom: 'var(--space-4)', fontFamily: 'ui-monospace, monospace' }}
        >
          {error.message}
        </p>
        <Button variant="primary" onClick={onBack}>
          Back to the menu
        </Button>
      </div>
    </div>
  );
}
