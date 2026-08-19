/**
 * The main menu.
 *
 * The game opened straight into a single implicit save, created the first time the app loaded
 * — so there was no point at which anybody chose anything. Starting a second career meant
 * destroying the first, and the choice of which world you were entering did not exist because
 * there was only one.
 *
 * This screen is the one place in the app that runs *outside* the game: it has no `GameDb`, no
 * shell and no tab bar, because none of those mean anything before a save is open. It reads the
 * registry, which is a summary written for exactly this purpose, so listing saves costs one
 * small read rather than deserialising eight hundred fighters per slot.
 */

import { useState } from 'react';
import {
  DEFAULT_WORLD_SIZE,
  ERAS,
  WORLD_SIZE_META,
  type EraId,
  type SaveSummary,
  type WorldSize,
} from '@mmasim/data';
import { Button, Card, Empty, Segmented } from '../ui';
import { Alert } from '../ui/signals';
import { formatGameDay } from '../shell/Shell';
import './MenuScreen.css';

export function MenuScreen({
  saves,
  onContinue,
  onNew,
  onDelete,
}: {
  saves: readonly SaveSummary[];
  onContinue(save: SaveSummary): void;
  onNew(era: EraId, name: string, size?: WorldSize): void;
  onDelete(id: string): void;
}) {
  /*
   * Generation is the default and the eras are the alternative, which is the way round doc 27 § 1.2
   * argues for: the seeded worlds are a testing artifact and, later, the shape the mod space fills.
   * A new player should get a world nobody has played before, not a snapshot of a real sport this
   * game cannot legally ship.
   */
  const [world, setWorld] = useState<'generated' | EraId>('generated');
  const [size, setSize] = useState<WorldSize>(DEFAULT_WORLD_SIZE);
  const [confirmingDelete, setConfirmingDelete] = useState<string | undefined>();
  const sizeMeta = WORLD_SIZE_META.find((s) => s.id === size) ?? WORLD_SIZE_META[1]!;
  const mostRecent = saves[0];

  return (
    <div className="menu">
      <header className="menu__head">
        <h1 className="menu__title">MMA Sim</h1>
        <p className="menu__tagline">One career, fifteen years, and a body that keeps the score.</p>
      </header>

      {/*
        Continue is the largest thing on the screen when there is something to continue.
        A returning player is here for one reason and should not have to find it.
      */}
      {mostRecent && (
        <Card raised>
          <div className="stack" style={{ gap: 'var(--space-3)' }}>
            <div>
              <p className="menu__eyebrow">Carry on</p>
              <p className="menu__save-name">{mostRecent.name}</p>
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                {describeSave(mostRecent)}
              </p>
            </div>
            <Button variant="primary" block onClick={() => onContinue(mostRecent)}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      <Card title="Start something new">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          {/*
            The era is a choice about which world, not a difficulty setting, so both options
            state what is actually different rather than which is harder. `Segmented` renders
            its hints visibly, which is the only reason this reads as a decision.
          */}
          <Segmented
            label="Which world"
            value={world}
            onChange={setWorld}
            options={[
              { value: 'generated' as const, label: 'Generated' },
              ...ERAS.map((e) => ({ value: e.id, label: e.name.split(' — ')[0]! })),
            ]}
          />
          <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
            {world === 'generated'
              ? 'A sport nobody has played before — promotions, fighters and eight years of history, built from a seed. Every save is a different world.'
              : ERAS.find((e) => e.id === world)?.blurb}
          </p>

          {world === 'generated' && (
            <>
              <Segmented
                label="How big"
                value={size}
                onChange={setSize}
                options={WORLD_SIZE_META.map((s) => ({ value: s.id, label: s.name }))}
              />
              <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
                {sizeMeta.blurb}
              </p>
              {/*
                The warning is on the size rather than in the prose, because it is a different
                kind of statement: the blurb says what you get and this says what it costs. Doc 27
                § 10.6 measured a Large world at about half a minute on a desktop, and the phone
                multiplier behind "several minutes" is an assumption rather than a measurement.
              */}
              {sizeMeta.warning && (
                <p
                  role="note"
                  className="prose"
                  style={{ fontSize: 'var(--text-sm)', color: 'var(--text-warning, #b45309)' }}
                >
                  {sizeMeta.warning}
                </p>
              )}
            </>
          )}

          <Button
            variant="primary"
            block
            onClick={() =>
              world === 'generated'
                ? onNew(ERAS[0]!.id, defaultSaveName(saves, 'generated'), size)
                : onNew(world, defaultSaveName(saves, world))
            }
          >
            New game
          </Button>
        </div>
      </Card>

      {saves.length > 0 && (
        <Card flush title={`${saves.length} save${saves.length === 1 ? '' : 's'}`}>
          <div className="list">
            {saves.map((save) => (
              <div key={save.id} className="menu__row">
                <button
                  type="button"
                  className="menu__open"
                  onClick={() => onContinue(save)}
                  aria-label={`Open ${save.name}`}
                >
                  <span className="list__primary" style={{ display: 'block' }}>
                    {save.name}
                  </span>
                  <span className="list__secondary" style={{ display: 'block' }}>
                    {describeSave(save)}
                  </span>
                </button>

                {/*
                  Two steps, and the confirm names the save rather than asking "are you sure".
                  This is the only action in the app that destroys a career outright, and the
                  registry row is a summary — once the namespace is swept there is nothing to
                  recover it from.
                */}
                {confirmingDelete === save.id ? (
                  <span className="row" style={{ gap: 'var(--space-2)' }}>
                    <Button
                      size="sm"
                      variant="danger"
                      autoFocus
                      onClick={() => {
                        onDelete(save.id);
                        setConfirmingDelete(undefined);
                      }}
                    >
                      Delete {save.name}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmingDelete(undefined)}
                    >
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmingDelete(save.id)}
                    aria-label={`Delete ${save.name}`}
                  >
                    Delete
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {saves.length === 0 && (
        <Empty title="No saves yet">
          Pick a world above and start one. Nothing here is permanent until you say so.
        </Empty>
      )}

      <Alert tone="info" title="Where your game lives">
        Saves are stored on this device, in the browser&rsquo;s own database. Clearing your browser
        data will remove them, and they do not follow you to another machine.
      </Alert>
    </div>
  );
}

/** One line under a save's name: who, which world, how far in. */
function describeSave(save: SaveSummary): string {
  const era = ERAS.find((e) => e.id === save.era);
  const parts = [era ? era.name.split(' — ')[0] : save.era];
  if (save.record) parts.push(save.record);
  parts.push(formatGameDay(save.day));
  return parts.join(' · ');
}

/**
 * A name for a new save before the player has made a fighter.
 *
 * Numbered per era rather than globally, so "2026 career 2" means the second time you started
 * that world rather than the second save you have ever made. It is renamed to the fighter's
 * name the moment there is one.
 */
function defaultSaveName(saves: readonly SaveSummary[], world: EraId | 'generated'): string {
  const matches =
    world === 'generated'
      ? saves.filter((s) => s.size !== undefined)
      : saves.filter((s) => s.size === undefined && s.era === world);
  const n = matches.length + 1;
  const label = world === 'generated' ? 'career' : `${world} career`;
  return `${label}${n > 1 ? ` ${n}` : ''}`;
}
